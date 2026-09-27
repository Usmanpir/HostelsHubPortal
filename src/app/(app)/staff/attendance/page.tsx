import Link from "next/link";
import { CalendarCheck, CalendarX2, Plane, UserCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { ExportMenu } from "@/components/data-table/export-menu";
import { AttendanceSheet } from "@/components/staff/attendance-sheet";
import { AttendanceLegend, AttendanceMonthGrid } from "@/components/staff/attendance-month-grid";
import { DayNav, HostelScopeSelect, MonthNav } from "@/components/staff/period-controls";
import { dayLabel, monthLabel, percentTone } from "@/components/staff/staff-format";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp } from "@/lib/page-helpers";
import { todayInTimeZone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthKey, parseDateKey } from "@/lib/validation/staff";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getDailySheet, getMonthlyAttendance } from "@/services/staff/attendance-service";
import { periodFromParams } from "@/services/staff/params";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: PageProps<"/staff/attendance">) {
  const ctx = await requireTenantPage("attendance.view");
  const params = await searchParams;
  const view = sp(params, "view") === "month" ? "month" : "day";
  const hostels = await listHostelOptions(ctx);
  const requested = sp(params, "hostel");
  const hostelId = requested && hostels.some((h) => h.id === requested) ? requested : null;
  const showHostelSelect = !ctx.activeHostelId && hostels.length > 1;
  const today = todayInTimeZone(ctx.organization.timezone);
  const current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const canMark = can(ctx, "attendance.manage");

  const viewHref = (v: "day" | "month") => {
    const q = new URLSearchParams();
    if (v === "month") q.set("view", "month");
    if (hostelId) q.set("hostel", hostelId);
    const s = q.toString();
    return s ? `/staff/attendance?${s}` : "/staff/attendance";
  };

  const toggle = (
    <div className="inline-flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Attendance view">
      {(["day", "month"] as const).map((v) => (
        <Link
          key={v}
          href={viewHref(v)}
          role="tab"
          aria-selected={view === v}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "day" ? "Daily sheet" : "Monthly"}
        </Link>
      ))}
    </div>
  );

  const noStaff = (
    <EmptyState
      icon={UsersRound}
      title="No active staff in this scope"
      description="Add staff and assign them to a hostel to start taking attendance."
      action={
        can(ctx, "staff.manage") ? (
          <Button asChild>
            <Link href="/staff/new">Add staff</Link>
          </Button>
        ) : null
      }
    />
  );

  if (view === "day") {
    const requestedDate = parseDateKey(sp(params, "date"));
    const date = requestedDate && requestedDate <= today ? requestedDate : today;
    const sheet = await getDailySheet(ctx, { date, hostelId });
    return (
      <>
        <PageHeader
          title="Attendance"
          description={dayLabel(date)}
          breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: "Attendance" }]}
          actions={<ExportMenu endpoint="/api/attendance/export" extraParams={{ month: date.slice(0, 7) }} />}
        />
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {toggle}
          <DayNav date={date} today={today} />
          {showHostelSelect ? (
            <div className="sm:ms-auto">
              <HostelScopeSelect hostels={hostels} allowAll value={hostelId} />
            </div>
          ) : null}
        </div>
        {!canMark ? (
          <p className="mb-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            You can view attendance but not mark it.
          </p>
        ) : null}
        {sheet.rows.length === 0 ? (
          noStaff
        ) : (
          <AttendanceSheet
            key={`${date}:${hostelId ?? ctx.activeHostelId ?? "all"}`}
            date={date}
            hostelId={hostelId ?? ctx.activeHostelId}
            rows={sheet.rows}
            readOnly={!canMark}
          />
        )}
      </>
    );
  }

  const period = periodFromParams(ctx, params);
  const data = await getMonthlyAttendance(ctx, { ...period, hostelId });
  const o = data.overall;

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`Monthly overview · ${monthLabel(period.year, period.month)}`}
        breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: "Attendance" }]}
        actions={<ExportMenu endpoint="/api/attendance/export" extraParams={{ month: monthKey(period.year, period.month) }} />}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {toggle}
        <MonthNav year={period.year} month={period.month} current={current} />
        {showHostelSelect ? (
          <div className="sm:ms-auto">
            <HostelScopeSelect hostels={hostels} allowAll value={hostelId} />
          </div>
        ) : null}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Attendance rate"
          value={o.percentage === null ? "—" : `${o.percentage}%`}
          hint={`${o.workingDays} working day marks`}
          icon={CalendarCheck}
          tone={percentTone(o.percentage)}
        />
        <StatCard label="Present + late" value={o.PRESENT + o.LATE} hint={`${o.LATE} late · ${o.HALF_DAY} half days`} icon={UserCheck} tone="success" />
        <StatCard label="Absent" value={o.ABSENT} icon={CalendarX2} tone={o.ABSENT ? "danger" : "default"} />
        <StatCard label="On leave" value={o.LEAVE} icon={Plane} tone="info" />
      </div>
      {data.rows.length === 0 ? (
        noStaff
      ) : (
        <div className="flex flex-col gap-3">
          <AttendanceLegend />
          <AttendanceMonthGrid
            year={data.year}
            month={data.month}
            dayCount={data.dayCount}
            rows={data.rows}
            today={today}
            linkDays={canMark}
            hostelId={hostelId}
          />
          <p className="text-xs text-muted-foreground">
            Attendance % = (present + late + ½ half days) ÷ marked working days (leave excluded).
          </p>
        </div>
      )}
    </>
  );
}
