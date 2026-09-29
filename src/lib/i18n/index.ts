import { en, type Messages } from "./messages/en";
import { navLabelOverrides } from "@/lib/terms";
import type { BusinessType } from "@/generated/prisma/enums";

export const SUPPORTED_LOCALES = ["en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const RTL_LOCALES = new Set(["ar", "ur", "fa", "he"]);

const dictionaries: Record<Locale, Messages> = { en };

/**
 * UI strings for a locale. Pass the organization's business type to swap
 * hostel vocabulary for property vocabulary (Hostels → Properties, Residents → Tenants).
 */
export function getMessages(locale: string | null | undefined, businessType?: BusinessType | null): Messages {
  const base = dictionaries[(locale ?? "en") as Locale] ?? en;
  const overrides = navLabelOverrides(businessType);
  if (!Object.keys(overrides).length) return base;
  return { ...base, nav: { ...base.nav, ...overrides } };
}

/** Text direction for <html dir>. Urdu/Arabic render right-to-left. */
export function directionFor(locale: string | null | undefined): "ltr" | "rtl" {
  return RTL_LOCALES.has((locale ?? "en").split("-")[0]!) ? "rtl" : "ltr";
}

export type { Messages };
