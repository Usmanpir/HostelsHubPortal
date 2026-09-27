import { z } from "zod";
import { PLAN_FEATURES } from "@/config/plans";
import { optionalText, requiredText } from "./common";

/** Schemas for the super admin panel (platform metadata only). */

export const ORGANIZATION_STATUSES = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;
export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"] as const;
export const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;
export const USER_STATUSES = ["ACTIVE", "DISABLED"] as const;
export const PLAN_FEATURE_KEYS = Object.values(PLAN_FEATURES) as [string, ...string[]];
export const PLAN_LIMIT_KEYS = ["maxHostels", "maxBeds", "maxResidents", "maxStaff", "maxStorageMb"] as const;

const page = z.coerce.number().int().min(1).max(100_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const search = z.string().trim().max(100).optional();

// ─── Organizations ──────────────────────────────────────────────────────────

export const adminOrganizationListSchema = z.object({
  q: search,
  status: z.enum(ORGANIZATION_STATUSES).optional(),
  subscription: z.enum(SUBSCRIPTION_STATUSES).optional(),
  planId: z.string().max(64).optional(),
  page,
  pageSize,
});
export type AdminOrganizationListInput = z.input<typeof adminOrganizationListSchema>;

export const organizationStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]),
    reason: optionalText(500),
  })
  .refine((v) => v.status !== "SUSPENDED" || (v.reason?.length ?? 0) >= 3, {
    message: "Give a reason for suspending this organization",
    path: ["reason"],
  });
export type OrganizationStatusInput = z.input<typeof organizationStatusSchema>;

export const changePlanSchema = z.object({
  planId: z.string().min(1, "Select a plan").max(64),
  interval: z.enum(BILLING_INTERVALS).default("MONTHLY"),
});
export type ChangePlanInput = z.input<typeof changePlanSchema>;

export const extendTrialSchema = z.object({
  days: z.coerce.number({ message: "Enter a number of days" }).int().min(1, "At least 1 day").max(365, "At most 365 days"),
});
export type ExtendTrialInput = z.input<typeof extendTrialSchema>;

// ─── Users ──────────────────────────────────────────────────────────────────

export const adminUserListSchema = z.object({
  q: search,
  status: z.enum(USER_STATUSES).optional(),
  role: z.enum(["superadmin"]).optional(),
  page,
  pageSize,
});
export type AdminUserListInput = z.input<typeof adminUserListSchema>;

export const userStatusSchema = z.object({ status: z.enum(USER_STATUSES) });
export const superAdminSchema = z.object({ isSuperAdmin: z.boolean() });

// ─── Plans ──────────────────────────────────────────────────────────────────

/** Empty / null = unlimited. */
const limitField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number({ message: "Enter a whole number" }).int("Enter a whole number").min(0, "Can't be negative").max(10_000_000).nullable(),
);

const price = z.coerce.number({ message: "Enter a price" }).min(0, "Price can't be negative").max(1_000_000).transform((v) => Math.round(v * 100) / 100);

export const planSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Key must be at least 2 characters")
    .max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes"),
  name: requiredText("Name", 80),
  description: optionalText(300),
  priceMonthly: price,
  priceYearly: price,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. USD"),
  trialDays: z.coerce.number({ message: "Enter a number" }).int().min(0).max(365),
  maxHostels: limitField,
  maxBeds: limitField,
  maxResidents: limitField,
  maxStaff: limitField,
  maxStorageMb: limitField,
  features: z.array(z.enum(PLAN_FEATURE_KEYS)).max(50).default([]),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number({ message: "Enter a number" }).int().min(-1000).max(1000).default(0),
});
export type PlanInput = z.input<typeof planSchema>;
export type PlanOutput = z.output<typeof planSchema>;

// ─── Subscriptions ──────────────────────────────────────────────────────────

export const adminSubscriptionListSchema = z.object({
  q: search,
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  planId: z.string().max(64).optional(),
  page,
  pageSize,
});
export type AdminSubscriptionListInput = z.input<typeof adminSubscriptionListSchema>;

export const subscriptionStatusSchema = z.object({ status: z.enum(["ACTIVE", "EXPIRED"]) });
export type SubscriptionStatusInput = z.input<typeof subscriptionStatusSchema>;

// ─── Feature flags ──────────────────────────────────────────────────────────

const flagKey = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Key must be at least 2 characters")
  .max(80)
  .regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/, "Use lowercase letters, numbers, dots, dashes or underscores");

export const featureFlagSchema = z.object({
  key: flagKey,
  description: optionalText(300),
  enabled: z.boolean().default(false),
});
export type FeatureFlagInput = z.input<typeof featureFlagSchema>;

export const featureFlagUpdateSchema = z.object({
  description: optionalText(300),
  enabled: z.boolean().optional(),
});
export type FeatureFlagUpdateInput = z.input<typeof featureFlagUpdateSchema>;

export const flagOverrideSchema = z.object({
  organizationId: z.string().min(1, "Select an organization").max(64),
  enabled: z.boolean(),
});
export type FlagOverrideInput = z.input<typeof flagOverrideSchema>;

export const FLAG_KEY_SCHEMA = flagKey;

// ─── System settings ────────────────────────────────────────────────────────

export const SETTING_KEY_SCHEMA = z
  .string()
  .trim()
  .min(2, "Key must be at least 2 characters")
  .max(100)
  .regex(/^[a-z0-9]+([._-][a-z0-9]+)*$/, "Use lowercase letters, numbers, dots, dashes or underscores");

/** Well-known settings and the shape their value must have. */
export const KNOWN_SETTINGS = {
  "signups.enabled": { description: "Allow new organizations to register (true / false).", schema: z.boolean(), example: "true" },
  "maintenance.banner": {
    description: "Text shown as a platform-wide banner. Use an empty string to hide it.",
    schema: z.string().max(500),
    example: '"Scheduled maintenance on Sunday 02:00–03:00 UTC"',
  },
} as const satisfies Record<string, { description: string; schema: z.ZodType; example: string }>;
export type KnownSettingKey = keyof typeof KNOWN_SETTINGS;

export function isKnownSetting(key: string): key is KnownSettingKey {
  return key in KNOWN_SETTINGS;
}

/** `value` is JSON text (e.g. `true`, `"text"`, `{"a":1}`); max 20 KB. */
export const systemSettingSchema = z
  .object({
    key: SETTING_KEY_SCHEMA,
    value: z.string().trim().min(1, "Enter a JSON value").max(20_000, "Value is too large"),
  })
  .superRefine((v, issue) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(v.value);
    } catch {
      issue.addIssue({ code: "custom", path: ["value"], message: 'Not valid JSON. Strings need quotes, e.g. "hello".' });
      return;
    }
    if (isKnownSetting(v.key)) {
      const result = KNOWN_SETTINGS[v.key].schema.safeParse(parsed);
      if (!result.success) {
        issue.addIssue({ code: "custom", path: ["value"], message: `Invalid value for ${v.key}: ${KNOWN_SETTINGS[v.key].description}` });
      }
    }
  });
export type SystemSettingInput = z.input<typeof systemSettingSchema>;

// ─── Audit ──────────────────────────────────────────────────────────────────

export const AUDIT_SCOPES = ["platform", "admin", "all"] as const;
export const adminAuditListSchema = z.object({
  q: search,
  scope: z.enum(AUDIT_SCOPES).default("all"),
  organizationId: z.string().max(64).optional(),
  page,
  pageSize,
});
export type AdminAuditListInput = z.input<typeof adminAuditListSchema>;
