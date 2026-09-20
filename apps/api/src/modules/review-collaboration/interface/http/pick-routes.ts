import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { grantFrom, sendClientError } from "../../../../interface/client-errors";
import type { PickSessionAdminUseCase } from "../../application/use-cases/open-pick-session.use-case";
import type { PickPortalUseCase } from "../../application/use-cases/pick-portal.use-case";

const projectParams = z.object({ projectId: z.string().uuid() });
const sessionParams = z.object({ projectId: z.string().uuid(), sessionId: z.string().uuid() });
const tokenParams = z.object({ token: z.string().min(10) });
const pickParams = z.object({ token: z.string().min(10), photoId: z.string().uuid() });

const openSchema = z.object({
  clientName: z.string().min(1).max(255),
  pickLimit: z.number().int().min(1).max(5000).optional(),
  ttlDays: z.number().int().min(1).max(365).optional(),
});
const pickSchema = z.object({ picked: z.boolean() });
const unlockSchema = z.object({ password: z.string().min(1).max(100) });

export interface PickDependencies {
  pickAdmin: PickSessionAdminUseCase;
  pickPortal: PickPortalUseCase;
}

export function registerPickRoutes(app: FastifyInstance, deps: PickDependencies): void {
  // --- Studio side: authenticated and tenancy-guarded through :projectId ------
  app.post("/projects/:projectId/pick-sessions", async (request, reply) => {
    const { projectId } = projectParams.parse(request.params);
    const body = openSchema.parse(request.body);
    const result = await deps.pickAdmin.open({ projectId, ...body });
    if (result.isFailure) return sendClientError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  app.get("/projects/:projectId/pick-sessions", async (request) => {
    const { projectId } = projectParams.parse(request.params);
    return deps.pickAdmin.list(projectId);
  });

  app.post("/projects/:projectId/pick-sessions/:sessionId/reopen", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const result = await deps.pickAdmin.reopen(projectId, sessionId);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  app.post("/projects/:projectId/pick-sessions/:sessionId/revoke", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const result = await deps.pickAdmin.revoke(projectId, sessionId);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  // What the studio opens in the details window: the link and its password, readable again.
  app.get("/projects/:projectId/pick-sessions/:sessionId/access", async (request, reply) => {
    const { projectId, sessionId } = sessionParams.parse(request.params);
    const result = await deps.pickAdmin.reveal(projectId, sessionId);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  // --- Client side: public, scoped by the share token ------------------------
  // A protected link answers 401 PASSWORD_REQUIRED until the password is entered here.
  app.post("/pick/:token/unlock", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const { password } = unlockSchema.parse(request.body);
    const result = await deps.pickPortal.unlock(token, password);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  app.get("/pick/:token", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const allowed = await deps.pickPortal.authorize(token, grantFrom(request));
    if (allowed.isFailure) return sendClientError(reply, allowed.getError());
    const result = await deps.pickPortal.view(token);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  app.put("/pick/:token/photos/:photoId", async (request, reply) => {
    const { token, photoId } = pickParams.parse(request.params);
    const allowed = await deps.pickPortal.authorize(token, grantFrom(request));
    if (allowed.isFailure) return sendClientError(reply, allowed.getError());
    const { picked } = pickSchema.parse(request.body);
    const result = await deps.pickPortal.setPick(token, photoId, picked);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  app.post("/pick/:token/submit", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const allowed = await deps.pickPortal.authorize(token, grantFrom(request));
    if (allowed.isFailure) return sendClientError(reply, allowed.getError());
    const result = await deps.pickPortal.submit(token);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });
}
