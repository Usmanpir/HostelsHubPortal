"use client";

import { useOrg } from "@/components/shared/org-context";
import { formatCompactMoney, formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import type { CellFormat, StatFormat } from "@/services/reports/types";

/** Formatting for report cells, stats and chart axes in the org's locale/currency. */
export function useValueFormat() {
  const org = useOrg();
  const { currency, locale, timezone } = org;

  const number = (v: number, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);

  const value = (format: CellFormat | StatFormat | undefined, v: string | number | null | undefined): string => {
    if (v === null || v === undefined || v === "") return "—";
    const n = typeof v === "number" ? v : Number(v);
    switch (format) {
      case "money":
        return formatMoney(n, currency, locale);
      case "number":
        return formatNumber(n, locale);
      case "percent":
        return `${number(n)}%`;
      case "days":
        return `${formatNumber(Math.round(n), locale)} ${Math.round(n) === 1 ? "day" : "days"}`;
      case "hours":
        return n >= 48 ? `${number(n / 24)} days` : `${number(n)} h`;
      case "date":
        return formatDate(String(v), locale);
      case "datetime":
        return formatDateTime(String(v), timezone, locale);
      default:
        return String(v);
    }
  };

  const axis = (format: "money" | "number" | "percent", v: number) => {
    if (format === "money") return formatCompactMoney(v, currency, locale);
    if (format === "percent") return `${number(v, 0)}%`;
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v);
  };

  /** x-axis / tooltip label for "YYYY-MM" and "YYYY-MM-DD" keys. */
  const period = (kind: "month" | "day" | "text" | undefined, key: string, long = false) => {
    if (kind === "month" && /^\d{4}-\d{2}$/.test(key)) {
      return new Intl.DateTimeFormat(locale, { month: long ? "long" : "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" }).format(
        new Date(`${key}-01T00:00:00Z`),
      );
    }
    if (kind === "day" && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(long ? { weekday: "short" } : {}), timeZone: "UTC" }).format(
        new Date(`${key}T00:00:00Z`),
      );
    }
    return key;
  };

  return { value, axis, period, currency, locale };
}
