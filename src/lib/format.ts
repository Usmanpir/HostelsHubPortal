/** Locale/currency-aware formatting shared by server and client components. */

export function formatMoney(amount: number | null | undefined, currency = "PKR", locale = "en") {
  const value = amount ?? 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(locale)}`;
  }
}

export function formatCompactMoney(amount: number, currency = "PKR", locale = "en") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
  } catch {
    return formatMoney(amount, currency, locale);
  }
}

export function formatNumber(value: number, locale = "en") {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(value: number, locale = "en") {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(value / 100);
}

/** Date-only values (stored as @db.Date) are UTC midnight; format them in UTC. */
export function formatDate(value: Date | string | null | undefined, locale = "en") {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined, timeZone?: string, locale = "en") {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(d);
}

export function formatTime(value: Date | string | null | undefined, timeZone?: string, locale = "en") {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(d);
}

export function formatRelative(value: Date | string, locale = "en") {
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (d.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

/** YYYY-MM-DD for <input type="date"> values (UTC based for date-only fields). */
export function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Today's date as YYYY-MM-DD in the given IANA time zone. */
export function todayInTimeZone(timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Convert a YYYY-MM-DD string to a Date at UTC midnight (for @db.Date columns). */
export function dateOnly(value: string | Date) {
  const s = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}
