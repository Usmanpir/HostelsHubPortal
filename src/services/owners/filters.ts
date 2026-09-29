import type { OwnerPayoutStatus } from "@/generated/prisma/enums";
import { OWNER_PAYOUT_STATUSES } from "@/lib/validation/owners";
import { OWNER_SORTS, type OwnerListFilters } from "./owner-service";
import { PAYOUT_SORTS, type PayoutListFilters } from "./payout-service";

/**
 * Parse owner/payout list filters from URL search params. Shared by pages,
 * REST routes and export routes. Invalid values are ignored, not rejected.
 */

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function getter(params: Params) {
  return (key: string): string | undefined => {
    const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return v === null || v === undefined || v === "" ? undefined : v.slice(0, 200);
  };
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function day(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function int(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const id = (value: string | undefined) => (value && /^[\w-]{1,64}$/.test(value) ? value : undefined);

export function parseOwnerFilters(params: Params): OwnerListFilters {
  const get = getter(params);
  return {
    q: get("q")?.slice(0, 100),
    status: oneOf(get("status"), ["ACTIVE", "ARCHIVED", "ALL"] as const),
    sort: oneOf(get("sort"), OWNER_SORTS),
    dir: oneOf(get("dir"), ["asc", "desc"] as const),
    page: int(get("page"), 1),
    pageSize: Math.min(100, int(get("pageSize"), 20)),
  };
}

export function parsePayoutFilters(params: Params): PayoutListFilters {
  const get = getter(params);
  return {
    q: get("q")?.slice(0, 100),
    status: oneOf<OwnerPayoutStatus>(get("status"), OWNER_PAYOUT_STATUSES),
    ownerId: id(get("owner")),
    from: day(get("from")),
    to: day(get("to")),
    sort: oneOf(get("sort"), PAYOUT_SORTS),
    dir: oneOf(get("dir"), ["asc", "desc"] as const),
    page: int(get("page"), 1),
    pageSize: Math.min(100, int(get("pageSize"), 20)),
  };
}

/** `?format=xlsx` or csv (default). */
export function exportFormat(params: URLSearchParams) {
  return params.get("format") === "xlsx" ? ("xlsx" as const) : ("csv" as const);
}
