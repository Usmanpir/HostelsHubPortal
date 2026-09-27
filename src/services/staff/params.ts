import type { TenantContext } from "@/lib/tenant/context";
import { todayInTimeZone } from "@/lib/format";
import {
  APPROVAL_STATUSES,
  EMPLOYMENT_TYPES,
  LEAVE_TYPES,
  parseMonthKey,
  PAYROLL_STATUSES,
  STAFF_STATUSES,
  STAFF_TYPES,
} from "@/lib/validation/staff";
import type { StaffListFilters } from "./staff-service";
import type { LeaveListFilters } from "./leave-service";

/**
 * Parse URL search params (pages, REST routes and export routes share these)
 * into typed service filters. Unknown values are ignored, never trusted.
 */
type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string): string | undefined {
  const v = params[key];
  const value = Array.isArray(v) ? v[0] : v;
  return value === "" || value === undefined ? undefined : value;
}

function oneOf<T extends string>(params: Params, key: string, allowed: readonly T[]): T | undefined {
  const v = first(params, key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function positiveInt(params: Params, key: string, fallback: number) {
  const n = Number(first(params, key));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function staffFiltersFromParams(params: Params): StaffListFilters {
  return {
    q: first(params, "q")?.slice(0, 100),
    designation: oneOf(params, "designation", STAFF_TYPES),
    status: oneOf(params, "status", [...STAFF_STATUSES, "ARCHIVED"] as const),
    employmentType: oneOf(params, "employmentType", EMPLOYMENT_TYPES),
    hostelId: first(params, "hostelId") ?? null,
    sort: first(params, "sort"),
    dir: oneOf(params, "dir", ["asc", "desc"] as const),
    page: positiveInt(params, "page", 1),
    pageSize: positiveInt(params, "pageSize", 20),
  };
}

export function leaveFiltersFromParams(params: Params): LeaveListFilters {
  return {
    q: first(params, "q")?.slice(0, 100),
    status: oneOf(params, "status", APPROVAL_STATUSES),
    type: oneOf(params, "type", LEAVE_TYPES),
    staffId: first(params, "staffId"),
    hostelId: first(params, "hostelId") ?? null,
    page: positiveInt(params, "page", 1),
    pageSize: positiveInt(params, "pageSize", 20),
  };
}

/** Period from ?month=YYYY-MM or ?year=&month=, defaulting to the current month in the org's time zone. */
export function periodFromParams(ctx: TenantContext, params: Params) {
  const monthParam = first(params, "month");
  const byKey = parseMonthKey(monthParam);
  if (byKey) return byKey;
  const year = Number(first(params, "year"));
  const month = Number(monthParam);
  if (Number.isInteger(year) && Number.isInteger(month) && year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
    return { year, month };
  }
  const today = todayInTimeZone(ctx.organization.timezone);
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

export function payrollStatusFromParams(params: Params) {
  return oneOf(params, "status", PAYROLL_STATUSES);
}

export function exportFormatFromParams(params: Params) {
  return first(params, "format") === "xlsx" ? ("xlsx" as const) : ("csv" as const);
}
