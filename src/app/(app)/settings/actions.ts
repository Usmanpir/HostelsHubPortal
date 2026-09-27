"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { signOut } from "@/auth";
import { runAction } from "@/lib/actions";
import { HOSTEL_COOKIE, tenantOrThrow } from "@/lib/tenant/server";
import type {
  BrandingInput,
  ChangePlanInput,
  DuplicateRoleInput,
  InviteMemberInput,
  InvoiceSettingsInput,
  MemberAccessInput,
  MemberRoleInput,
  MemberStatusInput,
  NotificationSettingsInput,
  OrganizationSettingsInput,
  RoleInput,
} from "@/lib/validation/settings";
import {
  signOutAllSessions,
  updateBranding,
  updateInvoiceSettings,
  updateNotificationSettings,
  updateOrganizationProfile,
} from "@/services/organization/settings-service";
import { createRole, deleteRole, duplicateRole, updateRole } from "@/services/organization/role-service";
import {
  cancelInvitation,
  changeMemberRole,
  inviteMember,
  removeMember,
  setMemberStatus,
  updateMemberHostelAccess,
} from "@/services/organization/member-service";
import { cancelSubscription, changePlan, resumeSubscription } from "@/services/organization/subscription-service";

// Thin wrappers: resolve the tenant from the session, call the service (which
// validates, authorizes and audits), then revalidate affected views.

// ─── Organization ───────────────────────────────────────────────────────────

export async function updateOrganizationProfileAction(input: OrganizationSettingsInput) {
  return runAction(async () => {
    const result = await updateOrganizationProfile(await tenantOrThrow(), input);
    // Name, logo and currency appear throughout the app shell.
    revalidatePath("/", "layout");
    return result;
  }, "Organization profile saved");
}

export async function updateBrandingAction(input: BrandingInput) {
  return runAction(async () => {
    await updateBranding(await tenantOrThrow(), input);
    revalidatePath("/", "layout");
    return null;
  }, "Branding saved");
}

export async function updateInvoiceSettingsAction(input: InvoiceSettingsInput) {
  return runAction(async () => {
    await updateInvoiceSettings(await tenantOrThrow(), input);
    revalidatePath("/settings/invoices");
    return null;
  }, "Invoice settings saved");
}

export async function updateNotificationSettingsAction(input: NotificationSettingsInput) {
  return runAction(async () => {
    await updateNotificationSettings(await tenantOrThrow(), input);
    revalidatePath("/settings/notifications");
    return null;
  }, "Notification settings saved");
}

// ─── Roles ──────────────────────────────────────────────────────────────────

export async function createRoleAction(input: RoleInput) {
  return runAction(async () => {
    const role = await createRole(await tenantOrThrow(), input);
    revalidatePath("/settings", "layout");
    return role;
  }, "Role created");
}

export async function duplicateRoleAction(id: string, input: DuplicateRoleInput) {
  return runAction(async () => {
    const role = await duplicateRole(await tenantOrThrow(), id, input);
    revalidatePath("/settings", "layout");
    return role;
  }, "Role duplicated");
}

export async function updateRoleAction(id: string, input: RoleInput) {
  return runAction(async () => {
    const role = await updateRole(await tenantOrThrow(), id, input);
    // Permission changes affect navigation for everyone holding the role.
    revalidatePath("/", "layout");
    return role;
  }, "Role saved");
}

export async function deleteRoleAction(id: string) {
  return runAction(async () => {
    await deleteRole(await tenantOrThrow(), id);
    revalidatePath("/settings", "layout");
    return null;
  }, "Role deleted");
}

// ─── Members & invitations ──────────────────────────────────────────────────

export async function changeMemberRoleAction(id: string, input: MemberRoleInput) {
  return runAction(async () => {
    const result = await changeMemberRole(await tenantOrThrow(), id, input);
    revalidatePath("/settings", "layout");
    return result;
  }, "Role updated");
}

export async function updateMemberAccessAction(id: string, input: MemberAccessInput) {
  return runAction(async () => {
    const result = await updateMemberHostelAccess(await tenantOrThrow(), id, input);
    revalidatePath("/settings/members");
    return result;
  }, "Hostel access updated");
}

export async function setMemberStatusAction(id: string, input: MemberStatusInput) {
  return runAction(
    async () => {
      const result = await setMemberStatus(await tenantOrThrow(), id, input);
      revalidatePath("/settings/members");
      return result;
    },
    input.status === "SUSPENDED" ? "Member suspended" : "Member reactivated",
  );
}

export async function removeMemberAction(id: string) {
  return runAction(async () => {
    await removeMember(await tenantOrThrow(), id);
    revalidatePath("/settings", "layout");
    return null;
  }, "Member removed");
}

export async function inviteMemberAction(input: InviteMemberInput) {
  return runAction(async () => {
    const result = await inviteMember(await tenantOrThrow(), input);
    revalidatePath("/settings/members");
    return result;
  }, "Invitation sent");
}

export async function revokeInvitationAction(id: string) {
  return runAction(async () => {
    await cancelInvitation(await tenantOrThrow(), id);
    revalidatePath("/settings/members");
    return null;
  }, "Invitation revoked");
}

// ─── Subscription ───────────────────────────────────────────────────────────

export async function changePlanAction(input: ChangePlanInput) {
  const result = await runAction(async () => {
    const change = await changePlan(await tenantOrThrow(), input);
    revalidatePath("/", "layout");
    return change;
  });
  if (result.ok) result.message = result.data.kind === "applied" ? "Plan updated" : "Redirecting to checkout…";
  return result;
}

export async function cancelSubscriptionAction() {
  return runAction(async () => {
    await cancelSubscription(await tenantOrThrow());
    revalidatePath("/", "layout");
    return null;
  }, "Cancellation scheduled");
}

export async function resumeSubscriptionAction() {
  return runAction(async () => {
    await resumeSubscription(await tenantOrThrow());
    revalidatePath("/", "layout");
    return null;
  }, "Subscription resumed");
}

// ─── Security ───────────────────────────────────────────────────────────────

/**
 * Sign out everywhere, including this browser. The session cookie is cleared
 * here; the client then navigates to the login page.
 */
export async function signOutAllSessionsAction() {
  return runAction(async () => {
    await signOutAllSessions(await tenantOrThrow());
    const jar = await cookies();
    jar.delete(HOSTEL_COOKIE);
    await signOut({ redirect: false });
    return { redirectTo: "/login" };
  }, "Signed out of all devices");
}
