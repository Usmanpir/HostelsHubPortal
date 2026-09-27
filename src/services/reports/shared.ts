import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { listHostelIds, scopedWhere, type TenantContext } from "@/lib/tenant/context";
import { dateOnly, todayInTimeZone } from "@/lib/format";
import { parseSearchParams } from "@/lib/validation/common";
import { addDays, dayKeys, daysBetween, monthKeys, resolveRange, type RangePreset } from "./range";
import type { ReportMeta } from "./registry";

/** Filters every report receives, resolved on the server. */
export type ReportFilters = {
  from: string;
  to: string;
  preset: RangePreset;
  hostelId: string | null;
  status: string | null;
  today: string;
  timezone: string;
};

export type Paging = { skip: number; take: number };

const rawFiltersSchema = z.object({
  range: z.string().max(40).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  hostelId: z.string().max(64).optional(),
  status: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Parse untrusted URL params into report filters (org time zone aware). */
export function parseReportFilters(
  ctx: TenantContext,
  meta: ReportMeta,
  params: Record<string, string | string[] | undefined>,
): { filters: ReportFilters; page: number; pageSize: number } {
  const raw = parseSearchParams(rawFiltersSchema, params);
  const timezone = ctx.organization.timezone || "UTC";
  const today = todayInTimeZone(timezone);
  const range = resolveRange(raw, today, meta.defaultPreset);
  const allowedStatus = meta.statusFilter?.options.some((o) => o.value === raw.status) ? raw.status! : null;
  return {
    filters: {
      from: range.from,
      to: range.to,
      preset: range.preset,
      hostelId: raw.hostelId ?? null,
      status: allowedStatus,
      today,
      timezone,
    },
    page: raw.page,
    pageSize: raw.pageSize,
  };
}

/** Hostel ids for this report (explicit filter → switcher → member access). */
export function reportHostelIds(ctx: TenantContext, f: Pick<ReportFilters, "hostelId">) {
  return listHostelIds(ctx, f.hostelId);
}

export function reportScope(ctx: TenantContext, f: Pick<ReportFilters, "hostelId">) {
  return scopedWhere(ctx, f.hostelId);
}

/**
 * `AND <column> IN (...)` for raw SQL. `column` must be a trusted identifier
 * written in code (e.g. `a."hostelId"`); ids are always bound parameters.
 */
export function hostelSql(ids: string[] | undefined, column: string): Prisma.Sql {
  if (!ids) return Prisma.empty;
  if (ids.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(ids)})`;
}

/** Staff are scoped to hostels through StaffHostelAssignment. */
export function staffScope(ctx: TenantContext, f: Pick<ReportFilters, "hostelId">): Prisma.StaffWhereInput {
  const ids = reportHostelIds(ctx, f);
  return {
    organizationId: ctx.organizationId,
    ...(ids ? { hostels: { some: { hostelId: { in: ids } } } } : {}),
  };
}

/** Raw SQL fragment restricting a staff id column to staff assigned to `ids`. */
export function staffSql(ids: string[] | undefined, staffIdColumn: string): Prisma.Sql {
  if (!ids) return Prisma.empty;
  if (ids.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND EXISTS (SELECT 1 FROM "StaffHostelAssignment" sha WHERE sha."staffId" = ${Prisma.raw(staffIdColumn)} AND sha."hostelId" IN (${Prisma.join(ids)}))`;
}

/** Where fragment for @db.Date columns. */
export function dateWhere(f: Pick<ReportFilters, "from" | "to">) {
  return { gte: dateOnly(f.from), lte: dateOnly(f.to) };
}

function tzOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - instant.getTime();
}

/** UTC instant of local midnight on `iso` in `timeZone`. */
export function zonedMidnight(iso: string, timeZone: string) {
  const guess = new Date(`${iso}T00:00:00.000Z`);
  try {
    const first = new Date(guess.getTime() - tzOffsetMs(guess, timeZone));
    return new Date(guess.getTime() - tzOffsetMs(first, timeZone));
  } catch {
    return guess;
  }
}

/** Where fragment for timestamp columns covering whole local days. */
export function timestampWhere(f: Pick<ReportFilters, "from" | "to" | "timezone">) {
  return { gte: zonedMidnight(f.from, f.timezone), lt: zonedMidnight(addDays(f.to, 1), f.timezone) };
}

/**
 * A UTC instant as a `timestamp` (without time zone) SQL literal parameter,
 * matching how Prisma stores DateTime columns — independent of session TZ.
 */
export function sqlTimestamp(d: Date): Prisma.Sql {
  return Prisma.sql`${d.toISOString().slice(0, 23)}::timestamp`;
}

/** Build month rows for every month in range, merging values found by key. */
export function fillMonths<T extends Record<string, number>>(
  f: Pick<ReportFilters, "from" | "to">,
  rows: Map<string, T>,
  empty: T,
): (T & { month: string })[] {
  return monthKeys(f.from, f.to).map((month) => ({ ...empty, ...(rows.get(month) ?? {}), month }));
}

/**
 * Time buckets for a trend chart: daily for ranges up to ~2 months,
 * otherwise monthly. `fmt` is a to_char() pattern bound as a parameter.
 */
export function buckets(f: Pick<ReportFilters, "from" | "to">) {
  const daily = daysBetween(f.from, f.to) <= 62;
  return {
    daily,
    fmt: daily ? "YYYY-MM-DD" : "YYYY-MM",
    keys: daily ? dayKeys(f.from, f.to) : monthKeys(f.from, f.to),
    xFormat: daily ? ("day" as const) : ("month" as const),
    label: daily ? "day" : "month",
  };
}

export function fillBuckets<T extends Record<string, number>>(keys: string[], rows: Map<string, T>, empty: T): (T & { period: string })[] {
  return keys.map((period) => ({ ...empty, ...(rows.get(period) ?? {}), period }));
}

export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Page/limit for rows() in view mode. */
export function toPaging(page: number, pageSize: number): Paging {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function nameOf(p: { firstName: string; lastName: string } | null | undefined) {
  return p ? `${p.firstName} ${p.lastName}`.trim() : null;
}

export function iso(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

export function isoDate(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}
