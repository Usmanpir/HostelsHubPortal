"use server";

import { signIn, signOut } from "@/auth";
import { runAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type { InviteSignupInput } from "@/lib/validation/auth";
import { acceptInvitation } from "@/services/organization/invitation-service";
import { registerInvitedUser } from "@/services/auth/auth-service";
import { getRequestMeta, setActiveOrganizationCookie } from "@/services/auth/request";

/** Accept an invitation as the signed-in user and switch to that organization. */
export async function acceptInvitationAction(token: string) {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new UnauthenticatedError();
    const { organizationId } = await acceptInvitation(user.id, String(token));
    await setActiveOrganizationCookie(organizationId);
    return { next: "/dashboard" };
  }, "Welcome aboard! You've joined the organization.");
}

/** Create an account for the invited email, accept the invitation and sign in. */
export async function inviteSignupAction(input: InviteSignupInput) {
  const meta = await getRequestMeta();
  return runAction(async () => {
    await enforceRateLimit(`register:${meta.ipAddress}`, RATE_LIMITS.register);
    const user = await registerInvitedUser(input, meta);
    const { organizationId } = await acceptInvitation(user.id, String(input.token));
    await setActiveOrganizationCookie(organizationId);
    try {
      await signIn("credentials", { email: user.email, password: String(input.password), redirect: false });
    } catch (error) {
      console.error("[invite] sign-in after signup failed", error);
      return { next: `/login?reason=registered&email=${encodeURIComponent(user.email)}` };
    }
    return { next: "/dashboard" };
  }, "Your account is ready. Welcome aboard!");
}

/** Sign out so the invitee can sign in with the invited email instead. */
export async function switchAccountAction(token: string, email: string) {
  return runAction(async () => {
    await signOut({ redirect: false });
    const callbackUrl = `/invite/${encodeURIComponent(String(token))}`;
    return { next: `/login?reason=invite&email=${encodeURIComponent(String(email))}&callbackUrl=${encodeURIComponent(callbackUrl)}` };
  });
}
