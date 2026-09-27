import type { PlanLimits } from "@/config/plans";
import { PLAN_FEATURES } from "@/config/plans";

const FEATURE_LABELS: Record<string, string> = {
  [PLAN_FEATURES.residentPortal]: "Resident self-service portal",
  [PLAN_FEATURES.exports]: "CSV & Excel exports",
  [PLAN_FEATURES.advancedReports]: "Advanced financial reports",
  [PLAN_FEATURES.emailNotifications]: "Email notifications",
  [PLAN_FEATURES.customRoles]: "Custom staff roles",
  [PLAN_FEATURES.customBranding]: "Custom branding",
};

function limit(value: number | null, singular: string, plural: string) {
  if (value === null) return `Unlimited ${plural}`;
  return `Up to ${value.toLocaleString("en")} ${value === 1 ? singular : plural}`;
}

/** Human-readable plan limits, e.g. "Up to 3 hostels". */
export function planLimitLines(limits: PlanLimits): string[] {
  const storage =
    limits.maxStorageMb === null
      ? "Unlimited file storage"
      : limits.maxStorageMb >= 1024
        ? `${Math.round(limits.maxStorageMb / 1024)} GB file storage`
        : `${limits.maxStorageMb} MB file storage`;
  return [
    limit(limits.maxHostels, "hostel", "hostels"),
    limit(limits.maxBeds, "bed", "beds"),
    limit(limits.maxResidents, "resident", "residents"),
    limit(limits.maxStaff, "staff member", "staff members"),
    storage,
  ];
}

export function planFeatureLines(features: string[]): string[] {
  return features.map((f) => FEATURE_LABELS[f]).filter((f): f is string => !!f);
}
