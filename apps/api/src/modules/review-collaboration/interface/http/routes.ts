import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { UniqueEntityId } from "@albumflow/domain-kernel";
import { ApplicationError, NotFoundError } from "../../../../shared-kernel/errors";
import type { ReviewSessionRepository } from "../../domain/review-session-repository";
import type { OpenReviewSessionUseCase } from "../../application/use-cases/open-review-session.use-case";
import type { ReviewPortalUseCase } from "../../application/use-cases/review-portal.use-case";
import type { AlbumFeedbackUseCase } from "../../application/use-cases/album-feedback.use-case";
import type { ReviewAccessUseCase } from "../../application/use-cases/review-access.use-case";
import { grantFrom, sendClientError } from "../../../../interface/client-errors";

const albumParams = z.object({ albumId: z.string().uuid() });
const tokenParams = z.object({ token: z.string().min(10) });

const openSchema = z.object({
  clientName: z.string().min(1).max(255),
  ttlDays: z.number().int().min(1).max(365).optional(),
});

const commentSchema = z.object({
  spreadIndex: z.number().int().min(0),
  slotId: z.string().optional(),
  body: z.string().min(1).max(2000),
});

const unlockSchema = z.object({ password: z.string().min(1).max(100) });
const reviewSessionParams = z.object({ albumId: z.string().uuid(), sessionId: z.string().uuid() });

const decisionSchema = z.object({ decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]) });

const commentParams = z.object({
  albumId: z.string().uuid(),
  commentId: z.string().uuid(),
});

export interface ReviewDependencies {
  openReviewSession: OpenReviewSessionUseCase;
  reviewPortal: ReviewPortalUseCase;
  albumFeedback: AlbumFeedbackUseCase;
  sessions: ReviewSessionRepository;
  /** Reveals a review link's URL token and password to the studio. Optional so tests can omit passwords. */
  reviewAccess?: ReviewAccessUseCase;
}

export function registerReviewRoutes(app: FastifyInstance, deps: ReviewDependencies): void {
  app.post("/albums/:albumId/review-sessions", async (request, reply) => {
    const { albumId } = albumParams.parse(request.params);
    const body = openSchema.parse(request.body);
    const result = await deps.openReviewSession.execute({
      albumId,
      clientName: body.clientName,
      ...(body.ttlDays ? { ttlDays: body.ttlDays } : {}),
    });
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  app.get("/albums/:albumId/review-sessions", async (request) => {
    const { albumId } = albumParams.parse(request.params);
    const sessions = await deps.sessions.findByAlbumId(UniqueEntityId.create(albumId));
    return sessions.map((session) => ({
      id: session.id.toString(),
      clientName: session.clientName,
      status: session.status,
      openComments: session.openComments.length,
      passwordProtected: Boolean(session.passwordHash),
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    }));
  });

  // What the studio opens in the details window: the link and its password, readable again.
  app.get("/albums/:albumId/review-sessions/:sessionId/access", async (request, reply) => {
    const { albumId, sessionId } = reviewSessionParams.parse(request.params);
    if (!deps.reviewAccess) return reply.code(404).send({ code: "NOT_FOUND", message: "Not available." });
    const result = await deps.reviewAccess.reveal(albumId, sessionId);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  // What the client actually wrote, for the person who has to act on it. Studio
  // authenticated and tenancy guarded, like every other /albums/:albumId route.
  app.get("/albums/:albumId/comments", async (request, reply) => {
    const { albumId } = albumParams.parse(request.params);
    const result = await deps.albumFeedback.list(albumId);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  app.post("/albums/:albumId/comments/:commentId/resolve", async (request, reply) => {
    const { albumId, commentId } = commentParams.parse(request.params);
    const result = await deps.albumFeedback.resolve(albumId, commentId);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  // Public, token-scoped surface. No studio authentication applies here by design.
  // A protected link answers 401 PASSWORD_REQUIRED until the password is entered here.
  app.post("/review/:token/unlock", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const { password } = unlockSchema.parse(request.body);
    const result = await deps.reviewPortal.unlock(token, password);
    if (result.isFailure) return sendClientError(reply, result.getError());
    return result.getValue();
  });

  app.get("/review/:token", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const allowed = await deps.reviewPortal.authorize(token, grantFrom(request));
    if (allowed.isFailure) return sendClientError(reply, allowed.getError());
    const result = await deps.reviewPortal.view(token);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  app.post("/review/:token/comments", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const allowed = await deps.reviewPortal.authorize(token, grantFrom(request));
    if (allowed.isFailure) return sendClientError(reply, allowed.getError());
    const body = commentSchema.parse(request.body);
    const result = await deps.reviewPortal.comment(token, {
      spreadIndex: body.spreadIndex,
      slotId: body.slotId,
      body: body.body,
    });
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  app.post("/review/:token/decision", async (request, reply) => {
    const { token } = tokenParams.parse(request.params);
    const allowed = await deps.reviewPortal.authorize(token, grantFrom(request));
    if (allowed.isFailure) return sendClientError(reply, allowed.getError());
    const { decision } = decisionSchema.parse(request.body);
    const result = await deps.reviewPortal.decide(token, decision);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });
}

function sendError(reply: FastifyReply, error: ApplicationError) {
  const status = error instanceof NotFoundError ? 404 : error.code === "CONFLICT" ? 409 : 422;
  return reply.code(status).send({ code: error.code, message: error.message });
}
