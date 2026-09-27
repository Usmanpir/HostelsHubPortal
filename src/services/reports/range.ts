/**
 * Date-range presets for reports. Pure functions on YYYY-MM-DD strings so
 * they run identically on the server (page + export API) and in the client
 * filter bar. "today" is always supplied in the organization's time zone.
 */

export const RANGE_PRESETS = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_30_days", label: "Last 30 days" },
  { key: "last_90_days", label: "Last 90 days" },
  { key: "last_6_months", label: "Last 6 months" },
  { key: "last_12_months", label: "Last 12 months" },
  { key: "this_year", label: "Year to date" },
  { key: "last_year", label: "Last year" },
  { key: "custom", label: "Custom range" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["key"];

export type DateRange = { from: string; to: string; preset: RangePreset };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Longest range a report may cover (keeps month/day series bounded). */
export const MAX_RANGE_DAYS = 366 * 5;

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function startOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string) {
  const d = toDate(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return toIso(d);
}

export function addMonths(iso: string, months: number) {
  const d = toDate(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIso(d);
}

export function daysBetween(from: string, to: string) {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

export function isPreset(value: string | null | undefined): value is RangePreset {
  return RANGE_PRESETS.some((p) => p.key === value);
}

export function presetLabel(preset: RangePreset) {
  return RANGE_PRESETS.find((p) => p.key === preset)?.label ?? "Custom range";
}

/** Concrete dates for a preset relative to `today` (YYYY-MM-DD). */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: string): { from: string; to: string } {
  switch (preset) {
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const start = addMonths(today, -1);
      return { from: start, to: endOfMonth(start) };
    }
    case "last_30_days":
      return { from: addDays(today, -29), to: today };
    case "last_90_days":
      return { from: addDays(today, -89), to: today };
    case "last_6_months":
      return { from: addMonths(today, -5), to: today };
    case "last_12_months":
      return { from: addMonths(today, -11), to: today };
    case "this_year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "last_year": {
      const year = Number(today.slice(0, 4)) - 1;
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
  }
}

/**
 * Resolve URL/query input to a concrete range. Explicit valid from/to win
 * (custom), otherwise the named preset, otherwise `fallback`.
 */
export function resolveRange(
  input: { range?: string | null; from?: string | null; to?: string | null },
  today: string,
  fallback: Exclude<RangePreset, "custom">,
): DateRange {
  const preset = isPreset(input.range) ? input.range : null;
  if (preset && preset !== "custom") return { ...presetRange(preset, today), preset };
  if (isIsoDate(input.from) && isIsoDate(input.to)) {
    let from = input.from;
    let to = input.to;
    if (from > to) [from, to] = [to, from];
    if (daysBetween(from, to) > MAX_RANGE_DAYS) from = addDays(to, -MAX_RANGE_DAYS);
    return { from, to, preset: "custom" };
  }
  return { ...presetRange(fallback, today), preset: fallback };
}

/** "YYYY-MM" keys for every month touched by the range, oldest first. */
export function monthKeys(from: string, to: string) {
  const keys: string[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);
  while (cursor <= last && keys.length < 120) {
    keys.push(cursor.slice(0, 7));
    cursor = addMonths(cursor, 1);
  }
  return keys;
}

/** Every YYYY-MM-DD in the range (bounded). */
export function dayKeys(from: string, to: string) {
  const keys: string[] = [];
  let cursor = from;
  while (cursor <= to && keys.length < MAX_RANGE_DAYS + 1) {
    keys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return keys;
}
