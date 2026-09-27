import { z } from "zod";
import { CURRENCIES, TIMEZONES } from "@/config/defaults";
import { emailSchema, optionalEmail, optionalPhone, optionalText, passwordSchema, requiredText } from "./common";

/**
 * Schemas for authentication, account, onboarding and marketing forms.
 * Shared by client forms (React Hook Form) and server services.
 */

const nameSchema = requiredText("Name", 120).min(2, "Enter your full name");

/** Plan keys that may be preselected from marketing links (?plan=…). */
export const SELECTABLE_PLAN_KEYS = ["trial", "starter", "business", "enterprise"] as const;
export type SelectablePlanKey = (typeof SELECTABLE_PLAN_KEYS)[number];

export function parsePlanKey(value: string | undefined | null): SelectablePlanKey | undefined {
  return value && (SELECTABLE_PLAN_KEYS as readonly string[]).includes(value) ? (value as SelectablePlanKey) : undefined;
}

/** Only same-origin relative paths are allowed as post-login destinations. */
export function safeCallbackUrl(value: string | undefined | null, fallback = "/dashboard"): string {
  if (!value || typeof value !== "string" || value.length > 1000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  const path = value.split(/[?#]/)[0] ?? "";
  if (["/login", "/register", "/forgot-password", "/reset-password"].includes(path)) return fallback;
  if (path.startsWith("/api/")) return fallback;
  return value;
}

// ─── Sign in / sign up ───────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
  callbackUrl: z.string().max(1000).optional(),
});
export type LoginInput = z.input<typeof loginSchema>;

const withConfirmation = <T extends z.ZodRawShape>(shape: T, field: "password" | "newPassword" = "password") =>
  z.object(shape).superRefine((value, ctx) => {
    const v = value as Record<string, unknown>;
    if (v[field] !== v.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords don't match" });
    }
  });

export const registerSchema = withConfirmation({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password").max(128),
  plan: z.enum(SELECTABLE_PLAN_KEYS).optional(),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resendVerificationSchema = forgotPasswordSchema;

const tokenSchema = z.string().trim().min(10, "This link is invalid").max(200, "This link is invalid");

export const resetPasswordSchema = withConfirmation({
  token: tokenSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password").max(128),
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const inviteSignupSchema = withConfirmation({
  token: tokenSchema,
  name: nameSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "Confirm your password").max(128),
});
export type InviteSignupInput = z.input<typeof inviteSignupSchema>;

// ─── Account ─────────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  name: nameSchema,
  phone: optionalPhone,
});
export type ProfileInput = z.input<typeof profileSchema>;

export const changePasswordSchema = withConfirmation(
  {
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password").max(128),
  },
  "newPassword",
).refine((v) => v.currentPassword !== v.newPassword, {
  path: ["newPassword"],
  message: "Choose a password different from your current one",
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

// ─── Onboarding ──────────────────────────────────────────────────────────────

const currencyCodes = CURRENCIES.map((c) => c.code) as [string, ...string[]];

export const onboardingOrganizationSchema = z.object({
  name: requiredText("Organization name", 120).min(2, "Organization name is too short"),
  phone: optionalPhone,
  email: optionalEmail,
  city: optionalText(100),
  country: optionalText(100),
  currency: z.enum(currencyCodes, { message: "Select a currency" }),
  timezone: z.enum(TIMEZONES, { message: "Select a time zone" }),
  planKey: z.string().trim().min(1, "Choose a plan").max(40),
});
export type OnboardingOrganizationInput = z.input<typeof onboardingOrganizationSchema>;

export const floorDraftSchema = z.object({
  floorNumber: z.coerce.number().int().min(-5).max(200),
  name: requiredText("Floor name", 60),
});

export const onboardingFloorsSchema = z
  .object({
    hostelId: z.string().min(1),
    floors: z.array(floorDraftSchema).min(1, "Add at least one floor").max(60, "Add up to 60 floors at a time"),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.floors.forEach((f, i) => {
      if (seen.has(f.floorNumber)) {
        ctx.addIssue({ code: "custom", path: ["floors", i, "floorNumber"], message: "Each floor needs a unique number" });
      }
      seen.add(f.floorNumber);
    });
  });
export type OnboardingFloorsInput = z.input<typeof onboardingFloorsSchema>;

/** Mirrors the invitation service schema so the client can validate before submit. */
export const staffInviteSchema = z
  .object({
    email: emailSchema,
    roleId: z.string().min(1, "Select a role"),
    allHostels: z.boolean().default(false),
    hostelIds: z.array(z.string().min(1)).max(200).default([]),
  })
  .refine((v) => v.allHostels || v.hostelIds.length > 0, {
    path: ["hostelIds"],
    message: "Select at least one hostel or grant access to all hostels",
  });
export type StaffInviteInput = z.input<typeof staffInviteSchema>;

// ─── Marketing ───────────────────────────────────────────────────────────────

export const demoRequestSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  company: optionalText(120),
  phone: optionalPhone,
  hostels: z.enum(["1", "2-5", "6-20", "20+"], { message: "Select how many hostels you run" }),
  message: optionalText(2000),
  /** Honeypot — real visitors never fill this in. */
  website: z.string().max(200).optional(),
});
export type DemoRequestInput = z.input<typeof demoRequestSchema>;
