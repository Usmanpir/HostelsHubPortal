import { z } from "zod";
import { optionalEmail, optionalText, phoneSchema, requiredText } from "./common";

/** Schemas for the public listings website (/l/[orgSlug]). Shared by forms and services. */

export const PUBLIC_PAGE_SIZE = 12;

/** Organization and listing slugs are lowercase words joined by hyphens. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid address");

export function isValidSlug(value: unknown): value is string {
  return slugSchema.safeParse(value).success;
}

export const PUBLIC_PURPOSES = ["SALE", "RENT"] as const;
export const PUBLIC_PROPERTY_TYPES = [
  "HOUSE",
  "APARTMENT",
  "PORTION",
  "ROOM",
  "HOSTEL_BED",
  "PLOT",
  "SHOP",
  "OFFICE",
  "WAREHOUSE",
  "BUILDING",
  "FARMHOUSE",
  "OTHER",
] as const;
export const PUBLIC_SORTS = ["newest", "price_asc", "price_desc"] as const;
export type PublicSort = (typeof PUBLIC_SORTS)[number];

/** Bad or hostile query-string values are dropped rather than failing the page. */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalPrice = z.preprocess(blankToUndefined, z.coerce.number().min(0).max(1e12).optional()).catch(undefined);

export const publicListingFiltersSchema = z.object({
  purpose: z.enum(PUBLIC_PURPOSES).optional().catch(undefined),
  type: z.enum(PUBLIC_PROPERTY_TYPES).optional().catch(undefined),
  /** Matches city or locality (case-insensitive, substring). */
  location: z.string().trim().max(80).optional().catch(undefined).transform((v) => v || undefined),
  minPrice: optionalPrice,
  maxPrice: optionalPrice,
  /** Minimum number of bedrooms. */
  beds: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(20).optional()).catch(undefined),
  sort: z.enum(PUBLIC_SORTS).default("newest").catch("newest"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type PublicListingFilters = z.output<typeof publicListingFiltersSchema>;

export const PREFERRED_CONTACTS = ["PHONE", "WHATSAPP", "EMAIL"] as const;
export type PreferredContact = (typeof PREFERRED_CONTACTS)[number];

export const publicInquirySchema = z
  .object({
    orgSlug: slugSchema,
    listingSlug: slugSchema,
    name: requiredText("Your name", 120),
    phone: phoneSchema,
    email: optionalEmail,
    message: optionalText(2000),
    preferredContact: z.enum(PREFERRED_CONTACTS, { message: "Choose how we should contact you" }),
    /** Honeypot — hidden from people, filled in by bots. */
    website: z.string().max(200).optional(),
    /** Epoch ms when the form was rendered; used to reject instant (scripted) submissions. */
    startedAt: z.coerce.number().int().nonnegative().optional(),
  })
  .refine((v) => v.preferredContact !== "EMAIL" || !!v.email, {
    path: ["email"],
    message: "Add your email so we can reply by email",
  });
export type PublicInquiryInput = z.input<typeof publicInquirySchema>;
