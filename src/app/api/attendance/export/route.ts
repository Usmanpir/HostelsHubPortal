import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { staffTypeLabels } from "@/config/labels";
import { monthKey } from "@/lib/validation/staff";
import { getMonthlyAttendance, type MonthlyAttendanceRow } from "@/services/staff/attendance-service";
import { ATTENDANCE_CODES } from "@/services/staff/attendance-math";
import { exportFormatFromParams, periodFromParams } from "@/services/staff/params";

/**
 * GET /api/attendance/export?month=YYYY-MM&hostel=&format=csv|xlsx
 * One row per staff member, one column per day (P/A/L/LV/H), then totals and %.
 */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = searchParamsObject(req);
  const period = periodFromParams(ctx, params);
  const hostelId = req.nextUrl.searchParams.get("hostel") || req.nextUrl.searchParams.get("hostelId") || null;
  const data = await getMonthlyAttendance(ctx, { ...period, hostelId });

  const dayColumns: ExportColumn<MonthlyAttendanceRow>[] = Array.from({ length: data.dayCount }, (_, i) => ({
    header: String(i + 1),
    value: (r) => {
      const s = r.days[i];
      return s ? ATTENDANCE_CODES[s] : "";
    },
    width: 5,
  }));
  const columns: ExportColumn<MonthlyAttendanceRow>[] = [
    { header: "Employee code", value: (r) => r.employeeCode, width: 14 },
    { header: "Name", value: (r) => r.name, width: 22 },
    { header: "Designation", value: (r) => staffTypeLabels[r.designation], width: 16 },
    ...dayColumns,
    { header: "Present", value: (r) => r.totals.PRESENT, width: 9 },
    { header: "Late", value: (r) => r.totals.LATE, width: 7 },
    { header: "Half day", value: (r) => r.totals.HALF_DAY, width: 9 },
    { header: "Absent", value: (r) => r.totals.ABSENT, width: 8 },
    { header: "Leave", value: (r) => r.totals.LEAVE, width: 7 },
    { header: "Working days marked", value: (r) => r.totals.workingDays, width: 12 },
    { header: "Attendance %", value: (r) => r.totals.percentage ?? "", width: 13 },
  ];
  return exportResponse(exportFormatFromParams(params), `attendance-${monthKey(period.year, period.month)}`, columns, data.rows);
});
