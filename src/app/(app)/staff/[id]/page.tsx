import Link from "next/link";
import { Building2, CalendarCheck, CalendarDays, Mail, Phone, Star, UserRound, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { StaffAvatar } from "@/components/staff/staff-avatar";
import { StaffDocuments } from "@/components/staff/staff-documents";
import { StaffProfileActions } from "@/components/staff/staff-profile-actions";
import { attendanceSoftClasses, monthLabel, percentTone } from "@/components/staff/staff-format";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDate, formatMoney, fullName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthKey } from "@/lib/validation/staff";
import { getStaff } from "@/services/staff/staff-service";
import { leaveDays } from "@/services/staff/leave-service";
import {
  approvalStatusLabels,
  approvalStatusTones,
  attendanceStatusLabels,
  employmentTypeLabels,
  leaveTypeLabels,
  payrollStatusLabels,
  payrollStatusTones,
  staffStatusLabels,
  staffStatusTones,
  staffTypeLabels,
} from "@/config/labels";
import type { AttendanceStatus } from "@/generated/prisma/enums";

const STATUS_ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "LEAVE"];

export default async function StaffProfilePage({ params }: PageProps<"/staff/[id]">) {
  const ctx = await requireTenantPage("staff.view");
  const { id } = await params;
  const staff = await loadOr404(getStaff(ctx, id));
  const name = fullName(staff);
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const archived = !!staff.archivedAt;
  const summary = staff.attendanceSummary;
  const lastPaid = staff.payrolls?.find((p) => p.status === "PAID") ?? null;
  const pendingLeaves = staff.recentLeaves?.filter((l) => l.status === "PENDING").length ?? 0;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <StaffAvatar name={name} photoFileId={staff.photoFileId} size="lg" />
            <span className="truncate">{name}</span>
            {archived ? (
              <StatusBadge tone="neutral">Archived</StatusBadge>
            ) : (
              <EnumBadge value={staff.status} labels={staffStatusLabels} tones={staffStatusTones} />
            )}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{staff.employeeCode}</span>
            <span>{staffTypeLabels[staff.designation]}</span>
            {staff.department ? <span>{staff.department}</span> : null}
            <span>{employmentTypeLabels[staff.employmentType]}</span>
          </span>
        }
        breadcrumbs={[{ label: "Staff", href: "/staff" }, { label: name }]}
        actions={can(ctx, "staff.manage") ? <StaffProfileActions staff={{ id: staff.id, name, archived }} /> : null}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Joined" value={formatDate(staff.joiningDate)} icon={CalendarDays} />
        {summary ? (
          <StatCard
            label={`Attendance · ${monthLabel(summary.year, summary.month)}`}
            value={summary.percentage === null ? "—" : `${summary.percentage}%`}
            hint={`${summary.workingDays} working day${summary.workingDays === 1 ? "" : "s"} marked`}
            icon={CalendarCheck}
            tone={percentTone(summary.percentage)}
            href={`/staff/attendance?view=month&month=${monthKey(summary.year, summary.month)}`}
          />
        ) : null}
        {staff.recentLeaves ? (
          <StatCard label="Pending leave" value={pendingLeaves} icon={CalendarDays} tone={pendingLeaves ? "warning" : "default"} href={`/staff/leave?staffId=${staff.id}`} />
        ) : null}
        {staff.salary !== null ? (
          <StatCard
            label="Monthly salary"
            value={money(staff.salary)}
            hint={lastPaid ? `Last paid ${monthLabel(lastPaid.year, lastPaid.month)}` : "No salary paid yet"}
            icon={Wallet}
            tone="info"
          />
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {summary ? (
            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Attendance this month</h2>
                <Link href={`/staff/attendance?view=month`} className="text-xs text-muted-foreground hover:text-primary">
                  Monthly view
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {STATUS_ORDER.map((s) => (
                  <div key={s} className={cn("rounded-lg px-3 py-2", attendanceSoftClasses[s])}>
                    <p className="text-xs font-medium">{attendanceStatusLabels[s]}</p>
                    <p className="tabular text-lg font-semibold">{summary[s]}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Attendance % = (present + late + ½ half days) ÷ marked working days. Leave days are excluded.
              </p>
            </section>
          ) : null}

          {staff.recentLeaves ? (
            <section className="rounded-xl border bg-card">
              <header className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Recent leave</h2>
                <Link href={`/staff/leave?staffId=${staff.id}`} className="text-xs text-muted-foreground hover:text-primary">
                  View all
                </Link>
              </header>
              {staff.recentLeaves.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No leave recorded.</p>
              ) : (
                <ul className="divide-y">
                  {staff.recentLeaves.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {leaveTypeLabels[l.type]} leave · {leaveDays(l.startDate, l.endDate)} day{leaveDays(l.startDate, l.endDate) === 1 ? "" : "s"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(l.startDate)} – {formatDate(l.endDate)}
                          {l.reason ? ` · ${l.reason}` : ""}
                        </p>
                      </div>
                      <EnumBadge value={l.status} labels={approvalStatusLabels} tones={approvalStatusTones} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {staff.payrolls ? (
            <section className="rounded-xl border bg-card">
              <header className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Payroll history</h2>
                <Link href="/staff/payroll" className="text-xs text-muted-foreground hover:text-primary">
                  Payroll
                </Link>
              </header>
              {staff.payrolls.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No salary records yet.</p>
              ) : (
                <ul className="divide-y">
                  {staff.payrolls.map((p) => (
                    <li key={p.id}>
                      <Link href={`/staff/payroll/${p.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-accent/30">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{monthLabel(p.year, p.month)}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.paymentDate ? `Paid ${formatDate(p.paymentDate)}` : "Not paid yet"}
                          </p>
                        </div>
                        <span className="tabular font-medium">{money(p.netSalary)}</span>
                        <EnumBadge value={p.status} labels={payrollStatusLabels} tones={payrollStatusTones} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {staff.documents ? (
            <StaffDocuments staffId={staff.id} documents={staff.documents} canManage={can(ctx, "staff.manage") && !archived} />
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Contact & details</h2>
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="size-3.5 text-muted-foreground" />
                <a href={`tel:${staff.phone}`} className="tabular hover:text-primary">
                  {staff.phone}
                </a>
              </div>
              {staff.email ? (
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  <a href={`mailto:${staff.email}`} className="truncate hover:text-primary">
                    {staff.email}
                  </a>
                </div>
              ) : null}
              {staff.idNumber ? (
                <div>
                  <dt className="text-xs text-muted-foreground">CNIC / ID</dt>
                  <dd className="tabular">{staff.idNumber}</dd>
                </div>
              ) : null}
              {staff.dateOfBirth ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Date of birth</dt>
                  <dd>{formatDate(staff.dateOfBirth)}</dd>
                </div>
              ) : null}
              {staff.address ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Address</dt>
                  <dd>{staff.address}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">App account</dt>
                <dd className="flex items-center gap-1.5">
                  <UserRound className="size-3.5 text-muted-foreground" />
                  {staff.user ? `${staff.user.name} (${staff.user.email})` : "Not linked"}
                </dd>
              </div>
              {archived ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Archived</dt>
                  <dd>
                    {formatDate(staff.archivedAt)} · {staffStatusLabels[staff.status]}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Hostels</h2>
            {staff.hostels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not assigned to a hostel.</p>
            ) : (
              <ul className="grid gap-2">
                {staff.hostels.map(({ hostel, isPrimary }) => (
                  <li key={hostel.id} className="flex items-center gap-2 text-sm">
                    <Building2 className="size-3.5 text-muted-foreground" />
                    {can(ctx, "hostels.view") ? (
                      <Link href={`/hostels/${hostel.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                        {hostel.name}
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{hostel.name}</span>
                    )}
                    {isPrimary ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="size-3 fill-current text-warning" />
                        Primary
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {staff.managedHostels.length ? (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                Manager of {staff.managedHostels.map((h) => h.name).join(", ")}
              </p>
            ) : null}
          </section>

          {staff.notes ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Notes</h2>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{staff.notes}</p>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
