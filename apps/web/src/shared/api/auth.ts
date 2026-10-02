import type { AuthSession, LoginInput, RegisterInput } from "@albumflow/contracts";
import { request } from "./http";

// --- Auth --------------------------------------------------------------

/** The account is created locked: it opens from the link emailed to the address. */
export function registerAccount(input: RegisterInput): Promise<{ status: "CONFIRMATION_SENT"; email: string }> {
  return request("/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function verifyEmail(token: string): Promise<AuthSession> {
  return request("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
}

/** Always resolves, whether or not the address has an account waiting. */
export function resendConfirmation(email: string, language: "en" | "ro"): Promise<void> {
  return request("/auth/resend-confirmation", { method: "POST", body: JSON.stringify({ email, language }) });
}

export function login(input: LoginInput): Promise<AuthSession> {
  return request("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

/** Always resolves, whether or not the address has an account — the API never says which. */
export function requestPasswordReset(email: string, language: "en" | "ro"): Promise<void> {
  return request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email, language }) });
}

export function resetPassword(token: string, password: string): Promise<AuthSession> {
  return request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
}
