"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { runAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type { ChangePasswordInput, ProfileInput } from "@/lib/validation/auth";
import { changePassword, sendVerificationEmail, updateProfile } from "@/services/auth/auth-service";
import { getRequestMeta } from "@/services/auth/request";

async function currentUser() {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function updateProfileAction(input: ProfileInput) {
  return runAction(async () => {
    const user = await currentUser();
    const updated = await updateProfile(user.id, input, await getRequestMeta());
    revalidatePath("/", "layout");
    return { name: updated.name };
  }, "Profile updated");
}

/**
 * Change password, then end this session too (every session was invalidated
 * by the sessionVersion bump). The client sends the user to sign in again.
 */
export async function changePasswordAction(input: ChangePasswordInput) {
  const result = await runAction(async () => {
    const user = await currentUser();
    await enforceRateLimit(`change-password:${user.id}`, RATE_LIMITS.passwordReset);
    await changePassword(user.id, input, await getRequestMeta());
    return { next: "/login?reason=password-changed" };
  }, "Password changed");
  if (result.ok) {
    try {
      await signOut({ redirect: false });
    } catch (error) {
      console.error("[account] sign-out after password change failed", error);
    }
  }
  return result;
}

export async function resendMyVerificationAction() {
  return runAction(async () => {
    const user = await currentUser();
    await enforceRateLimit(`verify-resend:user:${user.id}`, RATE_LIMITS.passwordReset);
    await sendVerificationEmail(user.id);
    return null;
  }, "Verification email sent. Check your inbox.");
}
