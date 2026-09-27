import type { AttendanceStatus } from "@/generated/prisma/enums";

/** Formatting helpers shared by server and client staff components (no "use client"). */

const monthFormatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function monthLabel(year: number, month: number) {
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

export function dayLabel(key: string) {
  return dayFormatter.format(new Date(`${key}T00:00:00.000Z`));
}

/** Solid cell colours for the monthly grid / legend. */
export const attendanceCellClasses: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success text-white",
  ABSENT: "bg-danger text-white",
  LATE: "bg-warning text-white",
  LEAVE: "bg-info text-white",
  HALF_DAY: "bg-violet text-white",
};

/** Soft variants for buttons and chips. */
export const attendanceSoftClasses: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success-soft text-success",
  ABSENT: "bg-danger-soft text-danger",
  LATE: "bg-warning-soft text-warning",
  LEAVE: "bg-info-soft text-info",
  HALF_DAY: "bg-violet-soft text-violet",
};

export function percentTone(pct: number | null): "success" | "warning" | "danger" | "default" {
  if (pct === null) return "default";
  if (pct >= 90) return "success";
  if (pct >= 75) return "warning";
  return "danger";
}
