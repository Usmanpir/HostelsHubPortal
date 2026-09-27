import { en, type Messages } from "./messages/en";

export const SUPPORTED_LOCALES = ["en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const RTL_LOCALES = new Set(["ar", "ur", "fa", "he"]);

const dictionaries: Record<Locale, Messages> = { en };

export function getMessages(locale: string | null | undefined): Messages {
  return dictionaries[(locale ?? "en") as Locale] ?? en;
}

/** Text direction for <html dir>. Urdu/Arabic render right-to-left. */
export function directionFor(locale: string | null | undefined): "ltr" | "rtl" {
  return RTL_LOCALES.has((locale ?? "en").split("-")[0]!) ? "rtl" : "ltr";
}

export type { Messages };
