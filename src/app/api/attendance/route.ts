import { readJson, tenantRoute } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import { parseDateKey, parseMonthKey, type AttendanceBatchInput } from "@/lib/validation/staff";
import { dateOnly } from "@/lib/format";
import {
  getDailySheet,
  getMonthlyAttendance,
  listAttendanceRecords,
  saveAttendance,
} from "@/services/staff/attendance-service";

/**
 * GET /api/attendance?date=YYYY-MM-DD&hostelId=       → daily sheet (staff, marks, approved leave)
 * GET /api/attendance?month=YYYY-MM&hostelId=         → monthly grid with per-status totals and %
 * GET /api/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD   → raw attendance records (max 92 days)
 * Without parameters, returns today's sheet.
 */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const p = req.nextUrl.searchParams;
  const hostelId = p.get("hostelId") || null;

  const month = p.get("month");
  if (month) {
    const period = parseMonthKey(month);
    if (!period) throw new ValidationError("month must be YYYY-MM.");
    return getMonthlyAttendance(ctx, { ...period, hostelId });
  }

  const from = p.get("from");
  const to = p.get("to");
  if (from || to) {
    const fromKey = parseDateKey(from);
    const toKey = parseDateKey(to);
    if (!fromKey || !toKey) throw new ValidationError("from and to must be YYYY-MM-DD.");
    const range = { from: dateOnly(fromKey), to: dateOnly(toKey) };
    const span = (range.to.getTime() - range.from.getTime()) / 86400_000;
    if (span < 0 || span > 92) throw new ValidationError("The range must be between 0 and 92 days.");
    return listAttendanceRecords(ctx, { ...range, hostelId });
  }

  const date = p.get("date");
  if (date && !parseDateKey(date)) throw new ValidationError("date must be YYYY-MM-DD.");
  return getDailySheet(ctx, { date, hostelId });
});

/** POST /api/attendance { date, hostelId?, entries: [{ staffId, status, checkInTime?, checkOutTime?, notes? }] } — upserts on (staffId, date). */
export const POST = tenantRoute(async ({ req, ctx }) => saveAttendance(ctx, (await readJson(req)) as AttendanceBatchInput));
