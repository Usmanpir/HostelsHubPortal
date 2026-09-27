import { attendanceStatusLabels, attendanceStatusTones } from "@/config/labels";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { StatusBadge, dotClasses, toneClasses } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

type Row = { id: string; date: Date | string; status: AttendanceStatus; checkInTime: string | null; checkOutTime: string | null };

const ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "HALF_DAY", "LEAVE", "ABSENT"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Read-only month calendar of a staff member's attendance (date-only rows, UTC). */
export function AttendanceMonth({
  monthStart,
  today,
  daysInMonth,
  rows,
  counts,
  locale = "en",
}: {
  monthStart: Date | string;
  today: string;
  daysInMonth: number;
  rows: Row[];
  counts: Record<AttendanceStatus, number>;
  locale?: string;
}) {
  const start = new Date(monthStart);
  const byDay = new Map(rows.map((r) => [new Date(r.date).getUTCDate(), r]));
  const leading = (start.getUTCDay() + 6) % 7; // Monday-first grid
  const todayDay = Number(today.slice(8, 10));
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(start);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{monthLabel}</h3>
        <span className="text-xs text-muted-foreground tabular">{rows.length} day{rows.length === 1 ? "" : "s"} marked</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.filter((s) => counts[s] > 0).map((s) => (
          <StatusBadge key={s} tone={attendanceStatusTones[s]}>
            {attendanceStatusLabels[s]} · {counts[s]}
          </StatusBadge>
        ))}
        {rows.length === 0 ? <span className="text-xs text-muted-foreground">No attendance marked this month yet.</span> : null}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-muted-foreground">
            {d}
          </span>
        ))}
        {Array.from({ length: leading }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const row = byDay.get(day);
          const tone = row ? attendanceStatusTones[row.status] : null;
          const title = row
            ? `${attendanceStatusLabels[row.status]}${row.checkInTime ? ` · in ${row.checkInTime}` : ""}${row.checkOutTime ? ` · out ${row.checkOutTime}` : ""}`
            : day > todayDay
              ? "Upcoming"
              : "Not marked";
          return (
            <span
              key={day}
              title={title}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-md tabular",
                tone ? toneClasses[tone] : day > todayDay ? "text-muted-foreground/50" : "bg-muted/40 text-muted-foreground",
                day === todayDay && "ring-2 ring-primary/50",
              )}
            >
              {day}
              {row ? <span className={cn("absolute bottom-1 size-1 rounded-full", dotClasses[tone!])} /> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
