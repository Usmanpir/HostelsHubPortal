import type { Tone } from "@/config/labels";

const KNOWN: Record<string, string> = {
  "organization.created": "Organization created",
  "auth.registered": "Account registered",
  "subscription.changed": "Subscription changed",
  "admin.organization.suspended": "Organization suspended",
  "admin.organization.reactivated": "Organization reactivated",
  "admin.subscription.plan_changed": "Plan changed by admin",
  "admin.subscription.trial_extended": "Trial extended",
  "admin.subscription.status_changed": "Subscription status changed",
  "admin.user.disabled": "User disabled",
  "admin.user.enabled": "User enabled",
  "admin.user.super_admin_granted": "Super admin granted",
  "admin.user.super_admin_revoked": "Super admin revoked",
  "admin.plan.created": "Plan created",
  "admin.plan.updated": "Plan updated",
  "admin.feature_flag.created": "Feature flag created",
  "admin.feature_flag.updated": "Feature flag updated",
  "admin.feature_flag.toggled": "Feature flag toggled",
  "admin.feature_flag.deleted": "Feature flag deleted",
  "admin.feature_flag.override_set": "Flag override set",
  "admin.feature_flag.override_removed": "Flag override removed",
  "admin.setting.created": "Setting created",
  "admin.setting.updated": "Setting updated",
  "admin.setting.deleted": "Setting deleted",
};

/** Human label for an audit action key; falls back to a readable version of the key. */
export function actionLabel(action: string) {
  if (KNOWN[action]) return KNOWN[action];
  const text = action.replace(/^admin\./, "").replace(/[._]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function actionTone(action: string): Tone {
  if (/suspended|disabled|revoked|deleted|expired/.test(action)) return "danger";
  if (action.startsWith("admin.")) return "accent";
  if (action === "organization.created" || action === "auth.registered") return "success";
  return "info";
}

export const organizationStatusLabels = { ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" } as const;
export const organizationStatusTones: Record<keyof typeof organizationStatusLabels, Tone> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
  CLOSED: "neutral",
};
export const userStatusLabels = { ACTIVE: "Active", DISABLED: "Disabled" } as const;
export const userStatusTones: Record<keyof typeof userStatusLabels, Tone> = { ACTIVE: "success", DISABLED: "danger" };
export const intervalLabels = { MONTHLY: "Monthly", YEARLY: "Yearly" } as const;
