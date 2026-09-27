import Link from "next/link";
import { attendanceStatusLabels, staffTypeLabels } from "@/config/labels";
import type { AttendanceStatus, StaffType } from "@/generated/prisma/enums";
import { ATTENDANCE_STATUSES } from "@/lib/validation/staff";
import { ATTENDANCE_CODES, type AttendanceTotals } from "@/services/staff/attendance-math";
import { cn } from "@/lib/utils";
import { attendanceCellClasses, percentTone } from "./staff-format";

export type MonthGridRow = {
  staffId: string;
  name: string;
  employeeCode: string;
  designation: StaffType;
  days: (AttendanceStatus | null)[];
  totals: AttendanceTotals;
};

const weekday = new Intl.DateTimeFormat("en", { weekday: "narrow", timeZone: "UTC" });

const pctClasses = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  default: "text-muted-foreground",
} as const;

export function AttendanceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {ATTENDANCE_STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("flex size-5 items-center justify-center rounded text-[10px] font-semibold", attendanceCellClasses[s])}>
            {ATTENDANCE_CODES[s]}
          </span>
          {attendanceStatusLabels[s]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-5 rounded border border-dashed bg-muted/40" />
        Not marked
      </span>
    </div>
  );
}

/** Staff × day grid for a month with per-status totals and attendance %. */
export function AttendanceMonthGrid({
  year,
  month,
  dayCount,
  rows,
  today,
  linkDays,
  hostelId,
}: {
  year: number;
  month: number;
  dayCount: number;
  rows: MonthGridRow[];
  /** YYYY-MM-DD in the org time zone — later days are shown as upcoming. */
  today: string;
  /** Link cells to the daily sheet (for members who can mark attendance). */
  linkDays: boolean;
  /** Carried into the daily-sheet links. */
  hostelId?: string | null;
}) {
  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, i + 1));
    const key = d.toISOString().slice(0, 10);
    return { n: i + 1, key, label: weekday.format(d), weekend: d.getUTCDay() === 0, future: key > today, isToday: key === today };
  });

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th scope="col" className="sticky start-0 z-10 min-w-44 border-b bg-muted px-3 py-2 text-start text-xs font-medium text-muted-foreground sm:min-w-56">
                Staff
              </th>
              {days.map((d) => (
                <th
                  key={d.n}
                  scope="col"
                  className={cn(
                    "w-8 min-w-8 border-b px-0 py-1.5 text-center text-[11px] font-medium text-muted-foreground",
                    d.weekend && "bg-muted/70",
                    d.isToday && "text-primary",
                  )}
                >
                  <span className="block leading-none opacity-70">{d.label}</span>
                  <span className="tabular mt-0.5 block leading-none">{d.n}</span>
                </th>
              ))}
              {(["PRESENT", "LATE", "HALF_DAY", "ABSENT", "LEAVE"] as const).map((s) => (
                <th key={s} scope="col" className="border-b border-s px-2 py-2 text-center text-[11px] font-medium text-muted-foreground" title={attendanceStatusLabels[s]}>
                  {ATTENDANCE_CODES[s]}
                </th>
              ))}
              <th scope="col" className="border-b px-3 py-2 text-end text-xs font-medium text-muted-foreground">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.staffId} className="group">
                <th scope="row" className="sticky start-0 z-10 border-b bg-card px-3 py-1.5 text-start font-normal group-hover:bg-accent/40">
                  <Link href={`/staff/${r.staffId}`} className="block max-w-52 truncate font-medium hover:text-primary">
                    {r.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {staffTypeLabels[r.designation]} · <span className="font-mono">{r.employeeCode}</span>
                  </span>
                </th>
                {days.map((d, i) => {
                  const s = r.days[i] ?? null;
                  const title = `${r.name} · ${d.key}: ${s ? attendanceStatusLabels[s] : d.future ? "Upcoming" : "Not marked"}`;
                  const cell = (
                    <span
                      className={cn(
                        "mx-auto flex size-6 items-center justify-center rounded text-[10px] font-semibold",
                        s ? attendanceCellClasses[s] : d.future ? "" : "border border-dashed bg-muted/40",
                      )}
                    >
                      {s ? ATTENDANCE_CODES[s] : ""}
                    </span>
                  );
                  return (
                    <td key={d.n} className={cn("border-b px-0.5 py-1.5 text-center group-hover:bg-accent/40", d.weekend && "bg-muted/30")}>
                      {linkDays && !d.future ? (
                        <Link href={`/staff/attendance?date=${d.key}${hostelId ? `&hostel=${hostelId}` : ""}`} title={title} aria-label={title} className="block rounded hover:ring-2 hover:ring-ring/40">
                          {cell}
                        </Link>
                      ) : (
                        <span title={title}>{cell}</span>
                      )}
                    </td>
                  );
                })}
                {(["PRESENT", "LATE", "HALF_DAY", "ABSENT", "LEAVE"] as const).map((s) => (
                  <td key={s} className="tabular border-b border-s px-2 py-1.5 text-center text-xs group-hover:bg-accent/40">
                    {r.totals[s] || <span className="text-muted-foreground/50">0</span>}
                  </td>
                ))}
                <td className={cn("tabular border-b px-3 py-1.5 text-end text-sm font-semibold group-hover:bg-accent/40", pctClasses[percentTone(r.totals.percentage)])}>
                  {r.totals.percentage === null ? "—" : `${r.totals.percentage}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
