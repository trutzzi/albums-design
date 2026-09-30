import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { loginInputSchema, registerInputSchema, studioBrandingSchema } from "@albumflow/contracts";
import { ApplicationError, NotFoundError, TooManyAttemptsError } from "../../../../shared-kernel/errors";
import { PLANS } from "../../domain/plan";
import type { StudioAdministrationUseCase } from "../../application/use-cases/studio-administration.use-case";
import type { RegisterUseCase } from "../../application/use-cases/register.use-case";
import type { LoginUseCase } from "../../application/use-cases/login.use-case";
import type { PasswordResetUseCase } from "../../application/use-cases/password-reset.use-case";
import type { BillingUseCase } from "../../application/use-cases/billing.use-case";
import type { HumanCheck } from "../../../../shared-kernel/human-check";
import "../../../../interface/request-context";

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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
  language: z.enum(["en", "ro"]).default("en"),
});

const verifyEmailSchema = z.object({ token: z.string().min(1).max(2048) });

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(2048),
  password: z.string().min(1).max(200),
});

export interface IdentityDependencies {
  administration: StudioAdministrationUseCase;
  register: RegisterUseCase;
  login: LoginUseCase;
  passwordReset: PasswordResetUseCase;
  billing: BillingUseCase;
  humanCheck?: HumanCheck | undefined;
}

export function registerIdentityRoutes(app: FastifyInstance, deps: IdentityDependencies): void {
  app.get("/plans", async () => Object.values(PLANS).map(toPlanDto));

  app.post("/auth/register", async (request, reply) => {
    const { website, captchaToken, ...body } = registerInputSchema.parse(request.body);
    // The hidden field was filled in: a bot. Answer exactly as for a person, create nothing.
    if (website) return reply.code(201).send({ status: "CONFIRMATION_SENT", email: body.email.trim().toLowerCase() });
    if (deps.humanCheck && !(await deps.humanCheck.verify(captchaToken, request.ip))) {
      return reply
        .code(400)
        .send({ code: "HUMAN_CHECK_FAILED", message: "Please complete the check that you are not a robot, then try again." });
    }
    const result = await deps.register.execute({ ...body, ip: request.ip });
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  app.post("/auth/verify-email", async (request, reply) => {
    const { token } = verifyEmailSchema.parse(request.body);
    const result = await deps.register.confirm(token);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  // 202 whether or not the address has an account waiting, so it reveals nothing.
  app.post("/auth/resend-confirmation", async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);
    await deps.register.resend(body);
    return reply.code(202).send({ ok: true });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginInputSchema.parse(request.body);
    const result = await deps.login.execute({ ...body, ip: request.ip });
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  // 202 whether or not the address has an account, so the form reveals nothing.
  app.post("/auth/forgot-password", async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);
    await deps.passwordReset.request(body);
    return reply.code(202).send({ ok: true });
  });

  app.post("/auth/reset-password", async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);
    const result = await deps.passwordReset.reset(body);
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

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
    return { ...result.getValue(), billing: { provider: deps.billing.provider } };
  });

  app.post("/studios/:studioId/members", async (request, reply) => {
    const { studioId } = studioParams.parse(request.params);
    const body = inviteSchema.parse(request.body);
    const result = await deps.administration.inviteMember({ studioId, ...body });
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(201).send(result.getValue());
  });

  // A logo arrives as a data: URL, larger than the default 1 MB body limit allows.
  app.put("/studios/:studioId/branding", { bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
    const { studioId } = studioParams.parse(request.params);
    const body = studioBrandingSchema.parse(request.body);
    const result = await deps.administration.setBranding(studioId, request.role, body);
    if (result.isFailure) return sendError(reply, result.getError());
    return { ...result.getValue(), billing: { provider: deps.billing.provider } };
  });

  app.delete("/studios/:studioId/members/:memberId", async (request, reply) => {
    const { studioId, memberId } = memberParams.parse(request.params);
    const result = await deps.administration.removeMember(studioId, memberId);
    if (result.isFailure) return sendError(reply, result.getError());
    return reply.code(204).send();
  });
}

export function registerBillingRoutes(app: FastifyInstance, billing: BillingUseCase): void {
  // Studios never pick their own plan: new ones start on Starter and a platform admin
  // moves them (see the admin routes). The portal stays for card and invoice details.
  app.post("/studios/:studioId/billing/portal", async (request, reply) => {
    const { studioId } = studioParams.parse(request.params);
    const result = await billing.portal({ studioId, role: request.role });
    if (result.isFailure) return sendError(reply, result.getError());
    return result.getValue();
  });

  // The signature covers the exact bytes Stripe sent, so this one route reads the body
  // raw instead of through the app-wide JSON parser (hence its own encapsulated scope).
  void app.register(async (scope) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
    scope.post("/billing/webhook", async (request, reply) => {
      const signature = request.headers["stripe-signature"];
      if (billing.provider === "none" || typeof signature !== "string" || !Buffer.isBuffer(request.body)) {
        return reply.code(400).send({ code: "BAD_REQUEST", message: "Not a billing webhook." });
      }
      try {
        await billing.handleWebhook(request.body, signature);
      } catch (error) {
        request.log.warn({ err: error }, "billing webhook rejected");
        // Stripe retries anything that is not 2xx, which is what an out-of-order event needs.
        return reply.code(400).send({ code: "BAD_REQUEST", message: "Webhook could not be applied." });
      }
      return { received: true };
    });
  });
}

function toPlanDto(plan: (typeof PLANS)[keyof typeof PLANS]) {
  return {
    ...plan,
    albumsPerPeriod: Number.isFinite(plan.albumsPerPeriod) ? plan.albumsPerPeriod : null,
    seats: Number.isFinite(plan.seats) ? plan.seats : null,
    maxPhotosPerShoot: Number.isFinite(plan.maxPhotosPerShoot) ? plan.maxPhotosPerShoot : null,
  };
}

function sendError(reply: FastifyReply, error: ApplicationError) {
  if (error instanceof TooManyAttemptsError) reply.header("Retry-After", String(error.retryAfterSeconds));
  const status =
    error instanceof NotFoundError
      ? 404
      : error.code === "CONFLICT"
        ? 409
        : error.code === "UNAUTHORIZED"
          ? 401
          : error.code === "FORBIDDEN" || error.code === "EMAIL_NOT_VERIFIED"
            ? 403
            : error.code === "TOO_MANY_ATTEMPTS"
              ? 429
              : 422;
  return reply.code(status).send({ code: error.code, message: error.message });
}
