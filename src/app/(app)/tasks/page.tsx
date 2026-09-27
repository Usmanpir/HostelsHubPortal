import Link from "next/link";
import { CalendarCheck, ClipboardCheck, Link2Off, Megaphone, MessageSquareWarning, Pin, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { AttendanceMonth } from "@/components/operations/attendance-month";
import { ComplaintTaskCard, MaintenanceTaskCard, PublishedAt } from "@/components/operations/task-cards";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { getMyTasks } from "@/services/operations/task-service";
import { announcementCategoryLabels, announcementCategoryTones, staffTypeLabels } from "@/config/labels";

export const metadata = { title: "My tasks" };

export default async function MyTasksPage() {
  const ctx = await requireTenantPage("tasks.view");
  const data = await getMyTasks(ctx);
  const firstName = ctx.userName.split(" ")[0] ?? ctx.userName;

  const announcements =
    data.announcements.length || can(ctx, "announcements.view") ? (
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Announcements</h2>
          {can(ctx, "announcements.view") ? (
            <Link href="/operations/announcements" className="text-xs text-muted-foreground hover:text-primary">
              View all
            </Link>
          ) : null}
        </div>
        {data.announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No current announcements for staff.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.announcements.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {a.isPinned ? <Pin className="size-3.5 text-violet" aria-label="Pinned" /> : null}
                  <EnumBadge value={a.category} labels={announcementCategoryLabels} tones={announcementCategoryTones} />
                  <span className="text-xs text-muted-foreground">
                    <PublishedAt value={a.publishedAt} />
                    {a.hostel ? ` · ${a.hostel.name}` : ""}
                  </span>
                </div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    ) : null;

  if (!data.staff) {
    return (
      <>
        <PageHeader title="My tasks" description={`Hi ${firstName} — your assigned work shows up here.`} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <EmptyState
              icon={Link2Off}
              title="Your account isn't linked to a staff profile"
              description="Maintenance jobs, complaints and attendance are tracked against staff records. Ask an administrator to open your staff profile under Staff and link it to your login email — your tasks will appear here right away."
            />
          </div>
          {announcements}
        </div>
      </>
    );
  }

  const openMaintenance = data.maintenance.filter((m) => m.status !== "COMPLETED" && m.status !== "REJECTED");
  const doneMaintenance = data.maintenance.filter((m) => m.status === "COMPLETED" || m.status === "REJECTED");
  const openComplaints = data.complaints.filter((c) => c.status !== "RESOLVED" && c.status !== "CLOSED");
  const doneComplaints = data.complaints.filter((c) => c.status === "RESOLVED" || c.status === "CLOSED");
  const hostels = data.staff.hostels.map((h) => h.hostel.name);
  const showHostel = hostels.length > 1;
  const att = data.attendance;
  const present = att ? att.counts.PRESENT + att.counts.LATE + att.counts.HALF_DAY : 0;

  return (
    <>
      <PageHeader
        title="My tasks"
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>Hi {firstName}</span>
            <span className="text-muted-foreground">·</span>
            <span>{staffTypeLabels[data.staff.designation]}</span>
            <span className="font-mono text-xs">{data.staff.employeeCode}</span>
            {hostels.length ? <span>· {hostels.join(", ")}</span> : null}
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Maintenance" value={openMaintenance.length} icon={Wrench} tone={openMaintenance.some((m) => m.priority === "URGENT") ? "danger" : "warning"} hint="Open jobs" />
        <StatCard label="Complaints" value={openComplaints.length} icon={MessageSquareWarning} tone="info" hint="Awaiting action" />
        <StatCard label="Days present" value={present} icon={CalendarCheck} tone="success" hint="This month" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              Maintenance jobs <span className="text-muted-foreground tabular">({openMaintenance.length})</span>
            </h2>
            {openMaintenance.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="No open maintenance jobs" description="New jobs assigned to you will appear here and in your notifications." className="py-8" />
            ) : (
              openMaintenance.map((m) => <MaintenanceTaskCard key={m.id} task={m} canWork={data.canWorkMaintenance} showHostel={showHostel} />)
            )}
            {doneMaintenance.length ? (
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Completed in the last 7 days ({doneMaintenance.length})</summary>
                <div className="mt-3 flex flex-col gap-3">
                  {doneMaintenance.map((m) => (
                    <MaintenanceTaskCard key={m.id} task={m} canWork={false} showHostel={showHostel} />
                  ))}
                </div>
              </details>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              Complaints <span className="text-muted-foreground tabular">({openComplaints.length})</span>
            </h2>
            {openComplaints.length === 0 ? (
              <EmptyState icon={Megaphone} title="No complaints assigned to you" description="When a manager routes a complaint to you, it shows up here." className="py-8" />
            ) : (
              openComplaints.map((c) => <ComplaintTaskCard key={c.id} task={c} showHostel={showHostel} />)
            )}
            {doneComplaints.length ? (
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Resolved in the last 7 days ({doneComplaints.length})</summary>
                <div className="mt-3 flex flex-col gap-3">
                  {doneComplaints.map((c) => (
                    <ComplaintTaskCard key={c.id} task={c} showHostel={showHostel} />
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          {att ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">My attendance</h2>
              <AttendanceMonth
                monthStart={att.monthStart}
                today={att.today}
                daysInMonth={att.daysInMonth}
                rows={att.rows}
                counts={att.counts}
                locale={ctx.organization.locale}
              />
            </section>
          ) : null}
          {announcements}
        </aside>
      </div>
    </>
  );
}
