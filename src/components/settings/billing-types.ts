import type { getBillingOverview } from "@/services/organization/subscription-service";
import type { PlanLimits } from "@/config/plans";
import { PLAN_FEATURES } from "@/config/plans";

export type BillingOverview = Awaited<ReturnType<typeof getBillingOverview>>;
export type BillingSubscription = NonNullable<BillingOverview["subscription"]>;
export type BillingPlan = BillingOverview["plans"][number];
export type BillingUsage = BillingOverview["usage"];

export const planFeatureLabels: Record<string, string> = {
  [PLAN_FEATURES.advancedReports]: "Advanced reports",
  [PLAN_FEATURES.exports]: "CSV & Excel exports",
  [PLAN_FEATURES.customBranding]: "Custom branding & domain",
  [PLAN_FEATURES.emailNotifications]: "Email notifications",
  [PLAN_FEATURES.residentPortal]: "Resident portal",
  [PLAN_FEATURES.customRoles]: "Custom roles",
};

export const ALL_PLAN_FEATURES = Object.values(PLAN_FEATURES);

export const limitRows: { key: keyof PlanLimits; usage: keyof BillingUsage; label: string; unit?: string }[] = [
  { key: "maxHostels", usage: "hostels", label: "Hostels" },
  { key: "maxBeds", usage: "beds", label: "Beds" },
  { key: "maxResidents", usage: "residents", label: "Active residents" },
  { key: "maxStaff", usage: "staff", label: "Staff" },
  { key: "maxStorageMb", usage: "storageMb", label: "Storage", unit: "MB" },
];

export function formatLimit(value: number | null, unit?: string) {
  if (value === null) return "Unlimited";
  if (unit === "MB" && value >= 1024) return `${Math.round((value / 1024) * 10) / 10} GB`;
  return `${value.toLocaleString("en")}${unit ? ` ${unit}` : ""}`;
}

export function formatPlanDate(value: Date | string | null | undefined, timeZone: string, locale: string) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
