import type { StatementPreset } from "@/config/owner-labels";

/**
 * Calendar helpers for owner statements. All values are YYYY-MM-DD strings in
 * the organization's time zone (date-only columns are compared at UTC midnight).
 * Pure functions — safe to import from client components.
 */

export type Period = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");

function parts(day: string) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

/** Last calendar day of a month (month is 1-based). */
function lastDayOfMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** From the 1st of `today`'s month up to and including `today`. */
export function thisMonth(today: string): Period {
  const { y, m } = parts(today);
  return { from: `${y}-${pad(m)}-01`, to: today };
}

/** The full calendar month before `today`'s month. */
export function lastMonth(today: string): Period {
  const { y, m } = parts(today);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDayOfMonth(py, pm))}` };
}

export function presetPeriod(preset: Exclude<StatementPreset, "custom">, today: string): Period {
  return preset === "this_month" ? thisMonth(today) : lastMonth(today);
}

/** Which preset (if any) a period corresponds to. */
export function detectPreset(period: Period, today: string): StatementPreset {
  const tm = thisMonth(today);
  if (period.from === tm.from && period.to === tm.to) return "this_month";
  const lm = lastMonth(today);
  if (period.from === lm.from && period.to === lm.to) return "last_month";
  return "custom";
}

/** Two inclusive date ranges share at least one day. */
export function periodsOverlap(a: Period, b: Period) {
  return a.from <= b.to && b.from <= a.to;
}

/** `outer` fully contains `inner`. */
export function periodCovers(outer: Period, inner: Period) {
  return outer.from <= inner.from && outer.to >= inner.to;
}

export function toDay(date: Date | string) {
  return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
}

/** Human label: "August 2026" for a full month, otherwise "1 Aug 2026 – 15 Sep 2026". */
export function periodLabel(period: Period, locale = "en") {
  const from = new Date(`${period.from}T00:00:00Z`);
  const to = new Date(`${period.to}T00:00:00Z`);
  const { y, m, d } = parts(period.from);
  const end = parts(period.to);
  if (d === 1 && end.y === y && end.m === m && end.d === lastDayOfMonth(y, m)) {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(from);
  }
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return period.from === period.to ? fmt.format(from) : `${fmt.format(from)} – ${fmt.format(to)}`;
}
