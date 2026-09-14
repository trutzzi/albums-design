import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { ApplicationError, NotFoundError } from "../../../../shared-kernel/errors";
import { PLANS } from "../../domain/plan";
import type { StudioAdministrationUseCase } from "../../application/use-cases/studio-administration.use-case";

const studioParams = z.object({ studioId: z.string().uuid() });
const memberParams = studioParams.extend({ memberId: z.string().uuid() });

const onboardSchema = z.object({
  name: z.string().min(1).max(255),
  ownerEmail: z.string().email(),
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.enum(["OWNER", "EDITOR", "VIEWER"]),
});

const planSchema = z.object({ planCode: z.enum(["TRIAL", "STARTER", "STUDIO", "STUDIO_PRO"]) });

export interface IdentityDependencies {
  administration: StudioAdministrationUseCase;
}

export function registerIdentityRoutes(app: FastifyInstance, deps: IdentityDependencies): void {
  app.get("/plans", async () => Object.values(PLANS).map(toPlanDto));

  app.post("/studios", async (request, reply) => {
    const body = onboardSchema.parse(request.body);
    const result = await deps.administration.onboard(body);
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  app.get("/studios/:studioId", async (request, reply) => {
    const { studioId } = studioParams.parse(request.params);
    const result = await deps.administration.overview(studioId);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  app.post("/studios/:studioId/members", async (request, reply) => {
    const { studioId } = studioParams.parse(request.params);
    const body = inviteSchema.parse(request.body);
    const result = await deps.administration.inviteMember({ studioId, ...body });
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  app.delete("/studios/:studioId/members/:memberId", async (request, reply) => {
    const { studioId, memberId } = memberParams.parse(request.params);
    const result = await deps.administration.removeMember(studioId, memberId);
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(204).send();
  });

  app.put("/studios/:studioId/plan", async (request, reply) => {
    const { studioId } = studioParams.parse(request.params);
    const { planCode } = planSchema.parse(request.body);
    const result = await deps.administration.changePlan(studioId, planCode);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });
}

function toPlanDto(plan: (typeof PLANS)[keyof typeof PLANS]) {
  return {
    ...plan,
    albumsPerPeriod: Number.isFinite(plan.albumsPerPeriod) ? plan.albumsPerPeriod : null,
    seats: Number.isFinite(plan.seats) ? plan.seats : null,
  };
}

function sendError(reply: FastifyReply, error: ApplicationError) {
  const status = error instanceof NotFoundError ? 404 : error.code === "CONFLICT" ? 409 : 422;
  return reply.code(status).send({ code: error.code, message: error.message });
}
