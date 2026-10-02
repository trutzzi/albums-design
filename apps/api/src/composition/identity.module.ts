import { NoHumanCheck, TurnstileHumanCheck } from "../shared-kernel/human-check";
import { StudioAdministrationUseCase } from "../modules/identity/application/use-cases/studio-administration.use-case";
import { RegisterUseCase } from "../modules/identity/application/use-cases/register.use-case";
import { LoginUseCase } from "../modules/identity/application/use-cases/login.use-case";
import { PasswordResetUseCase } from "../modules/identity/application/use-cases/password-reset.use-case";
import { BillingUseCase } from "../modules/identity/application/use-cases/billing.use-case";
import { EmailConfirmationMailer } from "../modules/identity/application/services/email-confirmation.mailer";
import { PasswordResetMailer } from "../modules/identity/application/services/password-reset.mailer";
import { SubscriptionQuotaPolicy } from "../modules/identity/application/subscription-quota-policy";
import { SharpLogoProcessor } from "../modules/identity/infrastructure/branding/sharp-logo-processor";
import { SubscriptionStudioBrandingDirectory } from "../modules/identity/infrastructure/branding/subscription-branding-directory";
import { SubscriptionPlanFeatureDirectory } from "../modules/identity/infrastructure/gateways/subscription-plan-features";
import type { ModuleInfrastructure, Repositories } from "./ports";

/** Identity & billing: accounts, studios, plans — and what other contexts may ask about a plan. */
export function buildIdentityModule(
  { env, logger, emailSender, billingGateway }: ModuleInfrastructure,
  repos: Repositories,
) {
  const { studios, subscriptions, members, projects } = repos;
  return {
    administration: new StudioAdministrationUseCase(studios, subscriptions, members, new SharpLogoProcessor()),
    register: new RegisterUseCase(
      studios,
      subscriptions,
      members,
      env.JWT_SECRET,
      new EmailConfirmationMailer(emailSender),
      env.WEB_ORIGIN,
    ),
    login: new LoginUseCase(members, env.JWT_SECRET),
    passwordReset: new PasswordResetUseCase(members, new PasswordResetMailer(emailSender), env.JWT_SECRET, env.WEB_ORIGIN),
    billing: new BillingUseCase(studios, subscriptions, billingGateway, env.WEB_ORIGIN),
    /** Cloudflare Turnstile on signup when TURNSTILE_SECRET_KEY is set; a pass-through otherwise. */
    humanCheck: env.TURNSTILE_SECRET_KEY
      ? new TurnstileHumanCheck(env.TURNSTILE_SECRET_KEY, fetch, logger.child({ component: "signup" }))
      : new NoHumanCheck(),
    // Read by other contexts through their own ports: album quota, per-plan features, branding.
    quotaPolicy: new SubscriptionQuotaPolicy(subscriptions),
    planFeatures: new SubscriptionPlanFeatureDirectory(projects, subscriptions),
    studioBranding: new SubscriptionStudioBrandingDirectory(projects, studios, subscriptions),
  };
}

export type IdentityModule = ReturnType<typeof buildIdentityModule>;
