import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendApplicationError } from "#src/interface/error-translator";
import type { SlideshowSessionAdminUseCase } from "../../application/use-cases/slideshow-session-admin.use-case";
import type { SlideshowPortalUseCase } from "../../application/use-cases/slideshow-portal.use-case";
import { MAX_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS } from "../../domain/slideshow-session";

const projectParams = z.object({ projectId: z.string().uuid() });
const sessionParams = z.object({ projectId: z.string().uuid(), sessionId: z.string().uuid() });
const tokenParams = z.object({ token: z.string().min(10) });
const NOINDEX = "noindex, nofollow, noarchive";

const intervalSeconds = z.number().int().min(MIN_INTERVAL_SECONDS).max(MAX_INTERVAL_SECONDS);
const transition = z.enum(["FADE", "NONE"]);

const openSchema = z.object({
  clientName: z.string().trim().max(255).optional(),
  clientEmail: z.string().trim().email().max(320).optional(),
  sendEmail: z.boolean().optional(),
  language: z.enum(["en", "ro"]).optional(),
  ttlDays: z.number().int().min(1).max(365).optional(),
  source: z.enum(["PICKS", "ALBUM", "SHOOT"]),
  albumId: z.string().uuid().optional(),
  intervalSeconds: intervalSeconds.optional(),
  transition: transition.optional(),
});
const settingsSchema = z
  .object({ intervalSeconds: intervalSeconds.optional(), transition: transition.optional() })
  .refine((body) => body.intervalSeconds !== undefined || body.transition !== undefined, "Nothing to change.");
const extendSchema = z.object({ days: z.number().int().min(1).max(365).optional() });
const invitationSchema = z.object({
  email: z.string().trim().email().max(320).optional(),
  language: z.enum(["en", "ro"]).optional(),
});

export interface SlideshowDependencies {
  slideshowAdmin: SlideshowSessionAdminUseCase;
  slideshowPortal: SlideshowPortalUseCase;
}

export function registerSlideshowRoutes(app: FastifyInstance, deps: SlideshowDependencies): void {
  // --- Studio side: authenticated and tenancy-guarded through :projectId ------
  app.post("/projects/:projectId/slideshow-sessions", async (request, reply) => {
    const { projectId } = projectParams.parse(request.params);
    const body = openSchema.parse(request.body);
    const result = await deps.slideshowAdmin.open({ projectId, ...body, clientName: body.clientName ?? "" });
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  app.get("/projects/:projectId/slideshow-sessions", async (request) => {
    const { projectId } = projectParams.parse(request.params);
    return deps.slideshowAdmin.list(projectId);
  });

  app.patch("/projects/:projectId/slideshow-sessions/:sessionId", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const { intervalSeconds, transition } = settingsSchema.parse(request.body);
    const result = await deps.slideshowAdmin.updateSettings(projectId, sessionId, {
      ...(intervalSeconds !== undefined ? { intervalSeconds } : {}),
      ...(transition ? { transition } : {}),
    });
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return result.getValue();
  });

  app.post("/projects/:projectId/slideshow-sessions/:sessionId/refresh", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const result = await deps.slideshowAdmin.refresh(projectId, sessionId);
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return result.getValue();
  });

  app.post("/projects/:projectId/slideshow-sessions/:sessionId/send", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const body = invitationSchema.parse(request.body ?? {});
    const result = await deps.slideshowAdmin.sendInvitation(projectId, sessionId, body);
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return result.getValue();
  });

  app.post("/projects/:projectId/slideshow-sessions/:sessionId/extend", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const { days } = extendSchema.parse(request.body ?? {});
    const result = await deps.slideshowAdmin.extend(projectId, sessionId, days);
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return result.getValue();
  });

  app.post("/projects/:projectId/slideshow-sessions/:sessionId/revoke", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const result = await deps.slideshowAdmin.revoke(projectId, sessionId);
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return result.getValue();
  });

  app.get("/projects/:projectId/slideshow-sessions/:sessionId/access", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const result = await deps.slideshowAdmin.reveal(projectId, sessionId);
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return result.getValue();
  });

  // --- Client side: public, scoped by the share token ------------------------
  // No password and made to be forwarded, so a link can end up posted publicly; keep
  // search engines from listing it. The web page carries the same as a meta tag.
  app.get("/slideshow/:token", async (request, reply) => {
    reply.header("X-Robots-Tag", NOINDEX);
    const { token } = tokenParams.parse(request.params);
    const result = await deps.slideshowPortal.view(token);
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return result.getValue();
  });

  // Separate from the view so the page's refetches (preview URLs expire) are not counted as views.
  app.post("/slideshow/:token/viewed", async (request, reply) => {
    reply.header("X-Robots-Tag", NOINDEX);
    const { token } = tokenParams.parse(request.params);
    const result = await deps.slideshowPortal.recordView(token);
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return reply.code(204).send();
  });
}
