import { z } from "zod";

/** Shared Zod building blocks used by forms (client) and services (server). */

export const idSchema = z.string().min(1, "Required").max(64);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const requiredText = (label = "This field", max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max);

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const optionalEmail = emailSchema.optional().or(z.literal("").transform(() => undefined));

export const phoneSchema = z
  .string()
  .trim()
  .min(5, "Enter a valid phone number")
  .max(30)
  .regex(/^[+\d][\d\s\-()]*$/, "Enter a valid phone number");

export const optionalPhone = phoneSchema.optional().or(z.literal("").transform(() => undefined));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128)
  .regex(/[a-zA-Z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

/** Accepts "2026-01-31" or a Date; outputs a Date at UTC midnight. */
export const dateSchema = z.coerce.date({ message: "Enter a valid date" });
export const optionalDate = z
  .union([z.literal("").transform(() => undefined), z.coerce.date()])
  .optional();

export const moneySchema = z.coerce
  .number({ message: "Enter an amount" })
  .min(0, "Amount cannot be negative")
  .max(1_000_000_000)
  .transform((v) => Math.round(v * 100) / 100);

export const positiveMoney = moneySchema.refine((v) => v > 0, "Amount must be greater than zero");

export const optionalMoney = z
  .union([z.literal("").transform(() => undefined), moneySchema])
  .optional()
  .nullable();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(50).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export function paginate(input: { page?: number; pageSize?: number }) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function toPaginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Parse a URLSearchParams-like record into a typed object with a schema. */
export function parseSearchParams<S extends z.ZodType>(
  schema: S,
  params: Record<string, string | string[] | undefined>,
): z.infer<S> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") flat[k] = value;
  }
  const result = schema.safeParse(flat);
  return result.success ? result.data : schema.parse({});
}
