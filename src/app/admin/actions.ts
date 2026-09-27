"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import type {
  ChangePlanInput,
  ExtendTrialInput,
  FeatureFlagInput,
  FlagOverrideInput,
  OrganizationStatusInput,
  PlanInput,
  SubscriptionStatusInput,
  SystemSettingInput,
} from "@/lib/validation/admin";
import { adminOrThrow } from "@/services/admin/guard";
import { changeOrganizationPlan, extendTrial, searchOrganizations, setOrganizationStatus } from "@/services/admin/organization-service";
import { setSuperAdmin, setUserStatus } from "@/services/admin/user-service";
import { createPlan, updatePlan } from "@/services/admin/plan-service";
import { setSubscriptionStatus } from "@/services/admin/subscription-service";
import {
  createFeatureFlag,
  deleteFeatureFlag,
  removeFlagOverride,
  setFlagOverride,
  updateFeatureFlag,
} from "@/services/admin/feature-flags";
import { deleteSystemSetting, upsertSystemSetting } from "@/services/admin/system-settings";

// Every action re-resolves the super admin from the session (403 otherwise).

export async function setOrganizationStatusAction(id: string, input: OrganizationStatusInput) {
  return runAction(async () => {
    await setOrganizationStatus(await adminOrThrow(), id, input);
    revalidatePath("/admin", "layout");
    return null;
  }, input.status === "SUSPENDED" ? "Organization suspended" : "Organization reactivated");
}

export async function changeOrganizationPlanAction(id: string, input: ChangePlanInput) {
  return runAction(async () => {
    await changeOrganizationPlan(await adminOrThrow(), id, input);
    revalidatePath("/admin", "layout");
    return null;
  }, "Plan updated");
}

export async function extendTrialAction(id: string, input: ExtendTrialInput) {
  return runAction(async () => {
    await extendTrial(await adminOrThrow(), id, input);
    revalidatePath("/admin", "layout");
    return null;
  }, "Trial extended");
}

export async function searchOrganizationsAction(q: string) {
  return runAction(async () => searchOrganizations(await adminOrThrow(), q));
}

export async function setUserStatusAction(id: string, status: "ACTIVE" | "DISABLED") {
  return runAction(async () => {
    await setUserStatus(await adminOrThrow(), id, { status });
    revalidatePath("/admin/users");
    return null;
  }, status === "DISABLED" ? "User disabled and signed out" : "User enabled");
}

export async function setSuperAdminAction(id: string, isSuperAdmin: boolean) {
  return runAction(async () => {
    await setSuperAdmin(await adminOrThrow(), id, { isSuperAdmin });
    revalidatePath("/admin/users");
    return null;
  }, isSuperAdmin ? "Super admin access granted" : "Super admin access revoked");
}

export async function createPlanAction(input: PlanInput) {
  return runAction(async () => {
    const plan = await createPlan(await adminOrThrow(), input);
    revalidatePath("/admin/plans");
    return { id: plan.id };
  }, "Plan created");
}

export async function updatePlanAction(id: string, input: PlanInput) {
  return runAction(async () => {
    await updatePlan(await adminOrThrow(), id, input);
    revalidatePath("/admin/plans");
    return { id };
  }, "Plan saved");
}

export async function setSubscriptionStatusAction(id: string, input: SubscriptionStatusInput) {
  return runAction(async () => {
    await setSubscriptionStatus(await adminOrThrow(), id, input);
    revalidatePath("/admin", "layout");
    return null;
  }, input.status === "ACTIVE" ? "Subscription marked active" : "Subscription marked expired");
}

export async function createFeatureFlagAction(input: FeatureFlagInput) {
  return runAction(async () => {
    await createFeatureFlag(await adminOrThrow(), input);
    revalidatePath("/admin/feature-flags");
    return null;
  }, "Flag created");
}

export async function toggleFeatureFlagAction(key: string, enabled: boolean) {
  return runAction(async () => {
    await updateFeatureFlag(await adminOrThrow(), key, { enabled });
    revalidatePath("/admin/feature-flags");
    return null;
  }, enabled ? "Flag enabled globally" : "Flag disabled globally");
}

export async function deleteFeatureFlagAction(key: string) {
  return runAction(async () => {
    await deleteFeatureFlag(await adminOrThrow(), key);
    revalidatePath("/admin/feature-flags");
    return null;
  }, "Flag deleted");
}

export async function setFlagOverrideAction(key: string, input: FlagOverrideInput) {
  return runAction(async () => {
    await setFlagOverride(await adminOrThrow(), key, input);
    revalidatePath("/admin/feature-flags");
    return null;
  }, "Override saved");
}

export async function removeFlagOverrideAction(key: string, organizationId: string) {
  return runAction(async () => {
    await removeFlagOverride(await adminOrThrow(), key, organizationId);
    revalidatePath("/admin/feature-flags");
    return null;
  }, "Override removed");
}

export async function upsertSystemSettingAction(input: SystemSettingInput) {
  return runAction(async () => {
    await upsertSystemSetting(await adminOrThrow(), input);
    revalidatePath("/admin/settings");
    return null;
  }, "Setting saved");
}

export async function deleteSystemSettingAction(key: string) {
  return runAction(async () => {
    await deleteSystemSetting(await adminOrThrow(), key);
    revalidatePath("/admin/settings");
    return null;
  }, "Setting deleted");
}
