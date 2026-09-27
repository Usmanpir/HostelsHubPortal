import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AuthHeading, FormAlert } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { sp } from "@/lib/page-helpers";
import { safeCallbackUrl } from "@/lib/validation/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to manage your hostels, residents and billing.",
};

const NOTICES: Record<string, { tone: "success" | "info"; text: string }> = {
  "password-changed": { tone: "success", text: "Your password was changed. Sign in again with your new password." },
  "password-reset": { tone: "success", text: "Your password has been updated. Sign in with your new password." },
  "password-set": { tone: "success", text: "Your password is set. Sign in to continue." },
  verified: { tone: "success", text: "Your email is verified. Sign in to continue." },
  registered: { tone: "success", text: "Your account is ready. Sign in to continue." },
  invite: { tone: "info", text: "Sign in to accept your invitation." },
  "signed-out": { tone: "info", text: "You've been signed out." },
};

/** Errors Auth.js appends when it redirects to the sign-in page. */
const AUTH_ERRORS: Record<string, string> = {
  CredentialsSignin: "That email and password combination didn't work.",
  AccessDenied: "You don't have access to that page.",
  Configuration: "Sign-in is temporarily unavailable. Please try again shortly.",
  Verification: "That sign-in link is invalid or has expired.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rawCallback = sp(params, "callbackUrl");
  const callbackUrl = rawCallback ? safeCallbackUrl(rawCallback) : undefined;
  const notice = NOTICES[sp(params, "reason") ?? ""];
  const errorKey = sp(params, "error");
  const authError = errorKey ? (AUTH_ERRORS[errorKey] ?? "We couldn't sign you in. Please try again.") : null;
  const email = sp(params, "email");
  // Already signed in with a *valid* (DB-checked) session → skip the form.
  if (await getSessionUser()) redirect(callbackUrl ?? "/dashboard");

  return (
    <>
      <AuthHeading title="Welcome back" description="Sign in to your workspace to pick up where you left off." />
      {notice ? (
        <FormAlert tone={notice.tone} className="mb-5">
          {notice.text}
        </FormAlert>
      ) : null}
      {authError ? <FormAlert className="mb-5">{authError}</FormAlert> : null}
      <LoginForm callbackUrl={callbackUrl} defaultEmail={email && email.length <= 254 ? email : undefined} />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
          Start your free trial
        </Link>
      </p>
    </>
  );
}
