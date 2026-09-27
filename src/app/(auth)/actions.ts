"use server";

import { after } from "next/server";
import { AuthError } from "next-auth";
import { auth, signIn, signOut } from "@/auth";
import { runAction, type ActionResult } from "@/lib/actions";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { normalizeError } from "@/lib/errors";
import {
  loginSchema,
  safeCallbackUrl,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "@/lib/validation/auth";
import {
  registerUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
} from "@/services/auth/auth-service";
import { getRequestMeta } from "@/services/auth/request";

export type LoginFailureReason = "invalid_credentials" | "account_locked" | "rate_limited" | "email_not_verified" | "unknown";

export type LoginResult = { ok: true; next: string } | { ok: false; reason: LoginFailureReason; error: string };

const LOGIN_MESSAGES: Record<LoginFailureReason, string> = {
  invalid_credentials: "That email and password combination didn't work. Check them and try again.",
  account_locked: "Too many failed attempts. For your security this account is locked for 15 minutes — try again later or reset your password.",
  rate_limited: "Too many sign-in attempts from this device. Please wait a few minutes and try again.",
  email_not_verified: "Please verify your email address first. We've sent a link to your inbox.",
  unknown: "We couldn't sign you in right now. Please try again.",
};

function loginFailure(error: unknown): LoginResult {
  if (error instanceof AuthError) {
    const code = (error as AuthError & { code?: string }).code;
    const reason: LoginFailureReason =
      error.type === "CredentialsSignin" && code && code in LOGIN_MESSAGES
        ? (code as LoginFailureReason)
        : error.type === "CredentialsSignin"
          ? "invalid_credentials"
          : "unknown";
    if (reason === "unknown") console.error("[auth] sign-in failed", error);
    return { ok: false, reason, error: LOGIN_MESSAGES[reason] };
  }
  console.error("[auth] sign-in failed", error);
  return { ok: false, reason: "unknown", error: LOGIN_MESSAGES.unknown };
}

/**
 * Sign in with email + password. Returns the destination on success (the
 * client navigates, so no redirect error surfaces in the form) or a friendly
 * reason on failure.
 */
export async function loginAction(raw: LoginInput): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials", error: "Enter your email and password." };
  const { email, password, callbackUrl } = parsed.data;
  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    return loginFailure(error);
  }
  // The dashboard layout routes residents to /portal, super admins to /admin
  // and brand-new accounts to /onboarding.
  return { ok: true, next: safeCallbackUrl(callbackUrl) };
}

export type RegisterOutcome =
  | { status: "signed_in"; next: string }
  | { status: "verify_email"; email: string }
  | { status: "sign_in"; email: string };

/**
 * Create an account, then sign in and continue to onboarding. When email
 * verification is required the user is asked to check their inbox instead.
 */
export async function registerAction(raw: RegisterInput): Promise<ActionResult<RegisterOutcome>> {
  const meta = await getRequestMeta();
  return runAction<RegisterOutcome>(async () => {
    await enforceRateLimit(`register:${meta.ipAddress}`, RATE_LIMITS.register);
    const user = await registerUser(raw, meta);
    if (user.verificationRequired) return { status: "verify_email", email: user.email };
    try {
      await signIn("credentials", { email: user.email, password: String(raw.password), redirect: false });
    } catch (error) {
      // The account exists; let the user sign in by hand rather than failing the signup.
      console.error("[auth] sign-in after registration failed", error);
      return { status: "sign_in", email: user.email };
    }
    const plan = typeof raw.plan === "string" ? raw.plan : undefined;
    return { status: "signed_in", next: plan ? `/onboarding?plan=${encodeURIComponent(plan)}` : "/onboarding" };
  });
}

const RESET_REQUESTED = "If an account exists for that email, we've sent a link to reset your password. It expires in 1 hour.";

/** Always returns the same message so accounts can't be discovered. */
export async function forgotPasswordAction(raw: ForgotPasswordInput): Promise<ActionResult<null>> {
  const meta = await getRequestMeta();
  return runAction(async () => {
    await enforceRateLimit(`password-reset:${meta.ipAddress}`, RATE_LIMITS.passwordReset);
    const deliver = await requestPasswordReset(raw, meta);
    // Send after responding so response time doesn't reveal whether the account exists.
    if (deliver) after(deliver);
    return null;
  }, RESET_REQUESTED);
}

/** Resend the email verification link (same response for every address). */
export async function resendVerificationAction(raw: ForgotPasswordInput): Promise<ActionResult<null>> {
  const meta = await getRequestMeta();
  return runAction(async () => {
    await enforceRateLimit(`verify-resend:${meta.ipAddress}`, RATE_LIMITS.passwordReset);
    const deliver = await resendVerification(raw);
    if (deliver) after(deliver);
    return null;
  }, "If that account still needs verifying, a new link is on its way.");
}

/** Set a new password from an emailed link; signs this browser out of any old session. */
export async function resetPasswordAction(raw: ResetPasswordInput): Promise<ActionResult<{ firstTime: boolean }>> {
  const meta = await getRequestMeta();
  const result = await runAction(async () => {
    await enforceRateLimit(`password-reset-submit:${meta.ipAddress}`, RATE_LIMITS.passwordReset);
    const outcome = await resetPassword(raw, meta);
    return { firstTime: outcome.firstTime };
  });
  if (result.ok) {
    // Every session was invalidated; clear this browser's cookie so the
    // sign-in page is reachable straight away.
    const session = await auth();
    if (session) {
      try {
        await signOut({ redirect: false });
      } catch (error) {
        const appError = normalizeError(error);
        if (appError.code === "INTERNAL_ERROR") console.error("[auth] sign-out after reset failed", error);
      }
    }
  }
  return result;
}
