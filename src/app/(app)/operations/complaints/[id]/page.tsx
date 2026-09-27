import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/components/operations/activity-timeline";
import { ComplaintAssignDialog, ComplaintStatusButtons } from "@/components/operations/complaint-actions";
import { EditComplaintDialog } from "@/components/operations/complaint-dialog";
import { requireTenantPage, homePathFor } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDateTime, fullName } from "@/lib/format";
import { getComplaint } from "@/services/operations/complaint-service";
import {
  complaintCategoryLabels,
  complaintStatusLabels,
  complaintStatusTones,
  priorityLabels,
  priorityTones,
  staffTypeLabels,
} from "@/config/labels";
import type { ComplaintStatus } from "@/generated/prisma/enums";

const FLOW: ComplaintStatus[] = ["OPEN", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default async function ComplaintDetailPage({ params }: PageProps<"/operations/complaints/[id]">) {
  const ctx = await requireTenantPage();
  if (!can(ctx, "complaints.view") && !can(ctx, "tasks.view")) redirect(homePathFor(ctx, "complaints.view"));
  const { id } = await params;
  const c = await loadOr404(getComplaint(ctx, id));
  const tz = ctx.organization.timezone;
  const locale = ctx.organization.locale;
  const closed = c.status === "RESOLVED" || c.status === "CLOSED";
  const stepIndex = FLOW.indexOf(c.status);
  const listHref = can(ctx, "complaints.view") ? "/operations/complaints" : "/tasks";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {c.title}
            <EnumBadge value={c.status} labels={complaintStatusLabels} tones={complaintStatusTones} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{c.complaintNumber}</span>
            <span>{c.hostel.name}</span>
            <span>{complaintCategoryLabels[c.category]}</span>
            <EnumBadge value={c.priority} labels={priorityLabels} tones={priorityTones} />
          </span>
        }
        breadcrumbs={[{ label: can(ctx, "complaints.view") ? "Complaints" : "My tasks", href: listHref }, { label: c.complaintNumber }]}
        actions={
          c.access.canManage ? (
            <>
              {!closed ? (
                <ComplaintAssignDialog
                  complaintId={c.id}
                  hostelId={c.hostelId}
                  assignedStaffId={c.assignedStaffId}
                  trigger={
                    <Button variant="outline">
                      <UserPlus />
                      {c.assignedStaff ? "Reassign" : "Assign"}
                    </Button>
                  }
                />
              ) : null}
              <EditComplaintDialog
                complaint={{ id: c.id, hostelId: c.hostelId, category: c.category, priority: c.priority, title: c.title, description: c.description, resident: c.resident }}
                trigger={
                  <Button variant="outline">
                    <Pencil />
                    Edit
                  </Button>
                }
              />
            </>
          ) : null
        }
      />

      {/* Workflow progress */}
      <ol className="mb-4 grid grid-cols-5 gap-1.5" aria-label="Complaint progress">
        {FLOW.map((s, i) => (
          <li key={s} className="flex flex-col gap-1.5">
            <span className={i <= stepIndex ? "h-1.5 rounded-full bg-primary" : "h-1.5 rounded-full bg-muted"} />
            <span className={i === stepIndex ? "truncate text-xs font-medium" : "truncate text-xs text-muted-foreground"}>{complaintStatusLabels[s]}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {c.access.allowedStatuses.length ? (
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Next step</h2>
                <p className="text-sm text-muted-foreground">Residents and assignees are notified of every status change.</p>
              </div>
              <ComplaintStatusButtons
                complaintId={c.id}
                status={c.status}
                allowed={c.access.allowedStatuses}
                resolution={c.resolution}
                className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
              />
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Complaint</h2>
            <p className="text-sm whitespace-pre-line">{c.description}</p>
          </section>

          {c.resolution ? (
            <section className="rounded-xl border border-success/30 bg-success-soft/40 p-4">
              <h2 className="mb-2 text-sm font-semibold">Resolution</h2>
              <p className="text-sm whitespace-pre-line">{c.resolution}</p>
              {c.resolvedAt ? <p className="mt-2 text-xs text-muted-foreground">Resolved {formatDateTime(c.resolvedAt, tz, locale)}</p> : null}
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">History</h2>
            <ActivityTimeline items={c.timeline} />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Resident</dt>
                <dd>
                  {c.resident ? (
                    <span className="flex flex-col">
                      {can(ctx, "residents.view") ? (
                        <Link href={`/residents/${c.resident.id}`} className="hover:text-primary">
                          {fullName(c.resident)}
                        </Link>
                      ) : (
                        <span>{fullName(c.resident)}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {c.resident.residentCode}
                        {c.resident.phone ? (
                          <>
                            {" · "}
                            <a href={`tel:${c.resident.phone}`} className="hover:text-primary">
                              {c.resident.phone}
                            </a>
                          </>
                        ) : null}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not linked to a resident</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Assigned to</dt>
                <dd>
                  {c.assignedStaff ? (
                    <span className="flex flex-col">
                      <span>{fullName(c.assignedStaff)}</span>
                      <span className="text-xs text-muted-foreground">{staffTypeLabels[c.assignedStaff.designation]}</span>
                    </span>
                  ) : (
                    <StatusBadge tone="warning">Unassigned</StatusBadge>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Submitted</dt>
                  <dd>{formatDateTime(c.createdAt, tz, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last update</dt>
                  <dd>{formatDateTime(c.updatedAt, tz, locale)}</dd>
                </div>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Logged by</dt>
                <dd>{c.submittedBy?.name ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
