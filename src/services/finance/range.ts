import { FINANCE_RANGE_PRESETS, type FinanceRangePreset } from "@/lib/validation/finance";

/**
 * Date ranges for finance screens. All values are date-only (UTC midnight)
 * computed from "today" in the organization's time zone. Pure, no server deps.
 */

export type DateRange = { from: Date; to: Date };
export type ResolvedRange = DateRange & { preset: FinanceRangePreset; label: string };

const DAY = 86400_000;

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m, d));
}

function parseDay(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isRangePreset(value: string | undefined | null): value is FinanceRangePreset {
  return !!value && (FINANCE_RANGE_PRESETS as readonly string[]).includes(value);
}

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en", { ...opts, timeZone: "UTC" }).format(d);

/** Resolve a preset (or custom from/to) relative to `todayIso` (YYYY-MM-DD in org time zone). */
export function resolveRange(
  todayIso: string,
  presetInput: string | undefined | null,
  fromInput?: string | null,
  toInput?: string | null,
): ResolvedRange {
  const today = parseDay(todayIso) ?? utc(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const preset: FinanceRangePreset = isRangePreset(presetInput) ? presetInput : "month";

  switch (preset) {
    case "today":
      return { preset, from: today, to: today, label: fmt(today, { day: "numeric", month: "short", year: "numeric" }) };
    case "week": {
      const weekday = (today.getUTCDay() + 6) % 7; // Monday = 0
      const from = new Date(today.getTime() - weekday * DAY);
      return { preset, from, to: today, label: `Week of ${fmt(from, { day: "numeric", month: "short" })}` };
    }
    case "last_month": {
      const from = utc(y, m - 1, 1);
      return { preset, from, to: utc(y, m, 0), label: fmt(from, { month: "long", year: "numeric" }) };
    }
    case "year":
      return { preset, from: utc(y, 0, 1), to: today, label: `${y} to date` };
    case "custom": {
      let from = parseDay(fromInput) ?? utc(y, m, 1);
      let to = parseDay(toInput) ?? today;
      if (to < from) [from, to] = [to, from];
      // Cap custom ranges at ten years to keep aggregations bounded.
      if (to.getTime() - from.getTime() > 3650 * DAY) from = new Date(to.getTime() - 3650 * DAY);
      return {
        preset,
        from,
        to,
        label: `${fmt(from, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`,
      };
    }
    case "month":
    default:
      return { preset: "month", from: utc(y, m, 1), to: today, label: fmt(today, { month: "long", year: "numeric" }) };
  }
}

/** Number of whole days in a range (inclusive). */
export function rangeDays(range: DateRange) {
  return Math.round((range.to.getTime() - range.from.getTime()) / DAY) + 1;
}
