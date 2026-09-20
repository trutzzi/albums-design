import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { streamZip } from "../../../../interface/zip-stream";
import { grantFrom, sendClientError } from "../../../../interface/client-errors";
import type { DownloadSessionAdminUseCase } from "../../application/use-cases/download-session-admin.use-case";
import type { DownloadPortalUseCase } from "../../application/use-cases/download-portal.use-case";

const projectParams = z.object({ projectId: z.string().uuid() });
const sessionParams = z.object({ projectId: z.string().uuid(), sessionId: z.string().uuid() });
const tokenParams = z.object({ token: z.string().min(10) });

const invitationSchema = z.object({
  email: z.string().trim().email().max(320).optional(),
  language: z.enum(["en", "ro"]).optional(),
});
const unlockSchema = z.object({ password: z.string().min(1).max(100) });

const openSchema = z.object({
  clientName: z.string().trim().max(255).optional(),
  clientEmail: z.string().trim().email().max(320).optional(),
  sendEmail: z.boolean().optional(),
  language: z.enum(["en", "ro"]).optional(),
  ttlDays: z.number().int().min(1).max(365).optional(),
});

export interface DownloadDependencies {
  downloadAdmin: DownloadSessionAdminUseCase;
  downloadPortal: DownloadPortalUseCase;
}

export function registerDownloadRoutes(app: FastifyInstance, deps: DownloadDependencies): void {
  // --- Studio side: authenticated and tenancy-guarded through :projectId ------
  app.post("/projects/:projectId/download-sessions", async (request, reply) => {
    const { projectId } = projectParams.parse(request.params);
    const body = openSchema.parse(request.body);
    const result = await deps.downloadAdmin.open({ projectId, ...body, clientName: body.clientName ?? "" });
    if (result.isFailure) return sendClientError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  app.get("/projects/:projectId/download-sessions", async (request) => {
    const { projectId } = projectParams.parse(request.params);
    return deps.downloadAdmin.list(projectId);
  });

  app.post("/projects/:projectId/download-sessions/:sessionId/send", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const body = invitationSchema.parse(request.body ?? {});
    const result = await deps.downloadAdmin.sendInvitation(projectId, sessionId, body);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  app.post("/projects/:projectId/download-sessions/:sessionId/revoke", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const result = await deps.downloadAdmin.revoke(projectId, sessionId);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  // What the studio opens in the details window: the link and its password, readable again.
  app.get("/projects/:projectId/download-sessions/:sessionId/access", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const result = await deps.downloadAdmin.reveal(projectId, sessionId);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  // --- Client side: public, scoped by the share token ------------------------
  // A protected link answers 401 PASSWORD_REQUIRED until the password is entered here.
  app.post("/download/:token/unlock", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const { password } = unlockSchema.parse(request.body);
    const result = await deps.downloadPortal.unlock(token, password);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  app.get("/download/:token", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const allowed = await deps.downloadPortal.authorize(token, grantFrom(request));
    if (allowed.isFailure) return sendClientError(reply, allowed.getError());
    const result = await deps.downloadPortal.view(token);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  // A plain link the browser follows, so the file goes straight to disk with
  // nothing held in the page's memory — that is what makes gigabytes workable.
  app.get("/download/:token/photos.zip", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const allowed = await deps.downloadPortal.authorize(token, grantFrom(request));
    if (allowed.isFailure) return sendClientError(reply, allowed.getError());
    const prepared = await deps.downloadPortal.prepare(token);
    if (prepared.isFailure) return sendClientError(reply, prepared.getError());
    const { fileName, entries, complete } = prepared.getValue();

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });

    let aborted = false;
    raw.once("close", () => {
      if (!raw.writableFinished) aborted = true;
    });

    const delivered = await streamZip(
      raw,
      entries.map((entry) => ({ name: entry.name, read: () => entry.photo.read() })),
      () => aborted,
    );
    if (delivered) await complete();
    else if (!raw.writableEnded) raw.destroy();
  });
}
