import type { AttendanceStatus } from "@/generated/prisma/enums";

export type AttendanceTotals = Record<AttendanceStatus, number> & {
  /** Days with a record, excluding LEAVE (approved absence doesn't count against the employee). */
  workingDays: number;
  /** 0–100, or null when no working days are marked. */
  percentage: number | null;
};

export function emptyTotals(): AttendanceTotals {
  return { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, HALF_DAY: 0, workingDays: 0, percentage: null };
}

/**
 * Attendance % = (present + late + 0.5 × half day) / marked working days.
 * Marked working days = all marked days except LEAVE.
 */
export function summarizeAttendance(statuses: Iterable<AttendanceStatus>): AttendanceTotals {
  const totals = emptyTotals();
  for (const s of statuses) totals[s]++;
  totals.workingDays = totals.PRESENT + totals.ABSENT + totals.LATE + totals.HALF_DAY;
  totals.percentage =
    totals.workingDays > 0
      ? Math.round(((totals.PRESENT + totals.LATE + 0.5 * totals.HALF_DAY) / totals.workingDays) * 1000) / 10
      : null;
  return totals;
}

/** Short codes used in the monthly grid and exports. */
export const ATTENDANCE_CODES: Record<AttendanceStatus, string> = {
  PRESENT: "P",
  ABSENT: "A",
  LATE: "L",
  LEAVE: "LV",
  HALF_DAY: "H",
};
