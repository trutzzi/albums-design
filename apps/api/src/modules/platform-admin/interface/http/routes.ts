import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendApplicationError } from "#src/interface/error-translator";
import { authenticatedStudioId } from "#src/interface/tenancy";
import type {
  AdminAccess,
  AdminDashboardUseCase,
  FeedbackUseCase,
  StudioPlansUseCase,
} from "../../application/use-cases/admin.use-cases";
import type { DeleteStudioUseCase } from "../../application/use-cases/studio-deletion.use-cases";
import type { ErrorInboxUseCase } from "../../application/use-cases/error-inbox.use-case";
import "#src/interface/request-context";

const kinds = z.enum(["IDEA", "PROBLEM", "QUESTION", "PRAISE"]);
const statuses = z.enum(["NEW", "IN_PROGRESS", "RESOLVED"]);

const submitSchema = z.object({
  kind: kinds,
  message: z.string().min(1).max(4000),
  rating: z.number().int().min(1).max(5).optional(),
  page: z.string().max(512).optional(),
});
const listSchema = z.object({ status: statuses.optional(), kind: kinds.optional() });
const triageSchema = z.object({ status: statuses.optional(), adminNote: z.string().max(4000).optional() });
const studioListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(200).default(50),
  search: z.string().trim().max(200).optional(),
});
const planSchema = z.object({ planCode: z.enum(["TRIAL", "STARTER", "STUDIO", "STUDIO_PRO"]) });
const errorStatuses = z.enum(["OPEN", "RESOLVED"]);
const errorListSchema = z.object({
  status: errorStatuses.optional(),
  source: z.enum(["api", "worker"]).optional(),
  search: z.string().trim().max(200).optional(),
});
const errorParams = z.object({ issueId: z.string().uuid() });

export interface PlatformAdminDependencies {
  access: AdminAccess;
  feedback: FeedbackUseCase;
  dashboard: AdminDashboardUseCase;
  plans: StudioPlansUseCase;
  deleteStudio?: DeleteStudioUseCase | undefined;
  /** The error log; absent where nothing records one. */
  errors?: ErrorInboxUseCase | undefined;
}

export function registerPlatformAdminRoutes(app: FastifyInstance, deps: PlatformAdminDependencies): void {
  // Any signed-in studio can tell us something.
  app.post("/feedback", async (request, reply) => {
    const body = submitSchema.parse(request.body);
    const result = await deps.feedback.submit({
      studioId: authenticatedStudioId(request),
      memberId: request.memberId,
      ...body,
      userAgent: request.headers["user-agent"],
    });
    if (result.isFailure) return sendApplicationError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  // The web app asks this to decide whether to show the Admin link at all.
  app.get("/admin/me", async (request) => ({ admin: await deps.access.isAdmin(request.memberId) }));

  app.register(async (admin) => {
    admin.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
      // 404 rather than 403: an admin area should not announce itself to everyone else.
      if (!(await deps.access.isAdmin(request.memberId))) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Not found." });
      }
    });

    admin.get("/admin/feedback", async (request) => deps.feedback.list(listSchema.parse(request.query)));

    admin.patch("/admin/feedback/:feedbackId", async (request, reply) => {
      const { feedbackId } = z.object({ feedbackId: z.string().uuid() }).parse(request.params);
      const result = await deps.feedback.triage(feedbackId, triageSchema.parse(request.body));
      if (result.isFailure) return sendApplicationError(reply, result.getError());
      return result.getValue();
    });

    admin.get("/admin/stats/business", async () => deps.dashboard.business());
    admin.get("/admin/stats/system", async () => deps.dashboard.system());

    admin.get("/admin/studios", async (request) => deps.plans.list(studioListSchema.parse(request.query)));

    // Every error-level log entry from the API and the worker, grouped into issues.
    admin.get("/admin/errors", async (request, reply) => {
      if (!deps.errors) return reply.code(404).send({ code: "NOT_FOUND", message: "Not found." });
      return deps.errors.list(errorListSchema.parse(request.query));
    });

    admin.get("/admin/errors/:issueId", async (request, reply) => {
      if (!deps.errors) return reply.code(404).send({ code: "NOT_FOUND", message: "Not found." });
      const { issueId } = errorParams.parse(request.params);
      const result = await deps.errors.detail(issueId);
      if (result.isFailure) return sendApplicationError(reply, result.getError());
      return result.getValue();
    });

    admin.patch("/admin/errors/:issueId", async (request, reply) => {
      if (!deps.errors) return reply.code(404).send({ code: "NOT_FOUND", message: "Not found." });
      const { issueId } = errorParams.parse(request.params);
      const { status } = z.object({ status: errorStatuses }).parse(request.body);
      const result = await deps.errors.setStatus(issueId, status);
      if (result.isFailure) return sendApplicationError(reply, result.getError());
      return result.getValue();
    });

    // `:targetStudioId` for the same reason as the plan route below: the tenancy guard
    // reads `studioId` as "the caller's own studio".
    admin.delete("/admin/studios/:targetStudioId", async (request, reply) => {
      if (!deps.deleteStudio) return reply.code(404).send({ code: "NOT_FOUND", message: "Not found." });
      const { targetStudioId } = z.object({ targetStudioId: z.string().uuid() }).parse(request.params);
      const result = await deps.deleteStudio.execute(targetStudioId);
      if (result.isFailure) return sendApplicationError(reply, result.getError());
      return result.getValue();
    });

    // `:targetStudioId`, not `:studioId`: the tenancy guard reads a `studioId` param as
    // "must be the caller's own studio", and an admin changes other people's.
    admin.put("/admin/studios/:targetStudioId/plan", async (request, reply) => {
      const { targetStudioId } = z.object({ targetStudioId: z.string().uuid() }).parse(request.params);
      const { planCode } = planSchema.parse(request.body);
      const result = await deps.plans.assign(targetStudioId, planCode);
      if (result.isFailure) return sendApplicationError(reply, result.getError());
      return result.getValue();
    });
  });
}

