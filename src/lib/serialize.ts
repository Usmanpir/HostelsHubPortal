import { Prisma } from "@/generated/prisma/client";

/**
 * Prisma returns Decimal objects for money columns, which cannot cross the
 * server → client component boundary. `serialize` deep-converts them to
 * numbers (amounts are stored with 2 decimals, well within float precision).
 */
export type Serialized<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? Date
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

export function serialize<T>(value: T): Serialized<T> {
  return convert(value) as Serialized<T>;
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convert);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = convert(v);
    return out;
  }
  return value;
}

export function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

/** Round to 2 decimals to avoid float drift in money arithmetic. */
export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
