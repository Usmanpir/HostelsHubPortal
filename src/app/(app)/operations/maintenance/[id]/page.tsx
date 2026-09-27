import Link from "next/link";
import { redirect } from "next/navigation";
import { Phone, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline } from "@/components/operations/activity-timeline";
import { PhotoGallery } from "@/components/operations/photo-gallery";
import {
  MaintenanceAssignDialog,
  MaintenanceEditDialog,
  MaintenanceNotesForm,
  MaintenanceStatusButtons,
} from "@/components/operations/maintenance-actions";
import { requireTenantPage, homePathFor } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDateTime, fullName } from "@/lib/format";
import { getMaintenance } from "@/services/operations/maintenance-service";
import {
  bedStatusLabels,
  bedStatusTones,
  maintenanceCategoryLabels,
  maintenanceStatusLabels,
  maintenanceStatusTones,
  priorityLabels,
  priorityTones,
  staffTypeLabels,
} from "@/config/labels";

export default async function MaintenanceDetailPage({ params }: PageProps<"/operations/maintenance/[id]">) {
  const ctx = await requireTenantPage();
  if (!can(ctx, "maintenance.view") && !can(ctx, "maintenance.work")) redirect(homePathFor(ctx, "maintenance.view"));
  const { id } = await params;
  const r = await loadOr404(getMaintenance(ctx, id));
  const tz = ctx.organization.timezone;
  const closed = r.status === "COMPLETED" || r.status === "REJECTED";
  const canReleaseBed = r.access.canManageBed && r.bed?.status === "MAINTENANCE";
  const backHref = can(ctx, "maintenance.view") ? "/operations/maintenance" : "/tasks";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {r.title}
            <EnumBadge value={r.status} labels={maintenanceStatusLabels} tones={maintenanceStatusTones} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{r.requestNumber}</span>
            <span>{r.hostel.name}</span>
            <span>{maintenanceCategoryLabels[r.category]}</span>
            <EnumBadge value={r.priority} labels={priorityLabels} tones={priorityTones} />
          </span>
        }
        breadcrumbs={[{ label: can(ctx, "maintenance.view") ? "Maintenance" : "My tasks", href: backHref }, { label: r.requestNumber }]}
        actions={
          r.access.canManage ? (
            <>
              {!closed ? (
                <MaintenanceAssignDialog
                  requestId={r.id}
                  hostelId={r.hostelId}
                  assignedStaffId={r.assignedStaffId}
                  trigger={
                    <Button variant="outline">
                      <UserPlus />
                      {r.assignedStaff ? "Reassign" : "Assign"}
                    </Button>
                  }
                />
              ) : null}
              <MaintenanceEditDialog
                request={{
                  id: r.id,
                  hostelId: r.hostelId,
                  roomId: r.roomId,
                  bedId: r.bedId,
                  category: r.category,
                  priority: r.priority,
                  title: r.title,
                  description: r.description,
                  resident: r.resident,
                }}
              />
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {r.access.allowedStatuses.filter((s) => s !== "ASSIGNED").length ? (
            <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Update status</h2>
                <p className="text-sm text-muted-foreground">
                  {r.status === "OPEN" && !r.assignedStaff ? "Assign someone or start work directly." : `Currently ${maintenanceStatusLabels[r.status].toLowerCase()}.`}
                </p>
              </div>
              <MaintenanceStatusButtons
                requestId={r.id}
                status={r.status}
                allowed={r.access.allowedStatuses}
                notes={r.resolutionNotes}
                canReleaseBed={canReleaseBed}
                className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
              />
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Description</h2>
            {r.description ? (
              <p className="text-sm whitespace-pre-line">{r.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No further details were provided.</p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Photos {r.photos.length ? <span className="text-muted-foreground">({r.photos.length})</span> : null}</h2>
            <PhotoGallery requestId={r.id} photos={r.photos} canAdd={r.access.canManage || r.access.canWork} canRemove={r.access.canManage} />
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Resolution notes</h2>
            {r.access.canManage || r.access.canWork ? (
              <MaintenanceNotesForm key={`${r.status}-${r.resolutionNotes ?? ""}`} requestId={r.id} status={r.status} notes={r.resolutionNotes} />
            ) : r.resolutionNotes ? (
              <p className="text-sm whitespace-pre-line">{r.resolutionNotes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">Activity</h2>
            <ActivityTimeline items={r.timeline} />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Location</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {r.room ? (
                    can(ctx, "rooms.view") ? (
                      <Link href={`/hostels/rooms/${r.room.id}`} className="hover:text-primary">
                        Room {r.room.roomNumber}
                      </Link>
                    ) : (
                      <span>Room {r.room.roomNumber}</span>
                    )
                  ) : (
                    <span>Common area</span>
                  )}
                  {r.bed ? (
                    <>
                      <span>· Bed {r.bed.bedNumber}</span>
                      <EnumBadge value={r.bed.status} labels={bedStatusLabels} tones={bedStatusTones} />
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Resident</dt>
                <dd>
                  {r.resident ? (
                    <span className="flex flex-col">
                      {can(ctx, "residents.view") ? (
                        <Link href={`/residents/${r.resident.id}`} className="hover:text-primary">
                          {fullName(r.resident)}
                        </Link>
                      ) : (
                        <span>{fullName(r.resident)}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {r.resident.residentCode}
                        {r.resident.phone ? (
                          <>
                            {" · "}
                            <a href={`tel:${r.resident.phone}`} className="hover:text-primary">
                              {r.resident.phone}
                            </a>
                          </>
                        ) : null}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Assigned to</dt>
                <dd>
                  {r.assignedStaff ? (
                    <span className="flex flex-col">
                      <span>{fullName(r.assignedStaff)}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {staffTypeLabels[r.assignedStaff.designation]}
                        {r.assignedStaff.phone ? (
                          <>
                            {" · "}
                            <Phone className="size-3" />
                            <a href={`tel:${r.assignedStaff.phone}`} className="hover:text-primary">
                              {r.assignedStaff.phone}
                            </a>
                          </>
                        ) : null}
                      </span>
                    </span>
                  ) : (
                    <StatusBadge tone="warning">Unassigned</StatusBadge>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Reported</dt>
                  <dd>{formatDateTime(r.createdAt, tz, ctx.organization.locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Completed</dt>
                  <dd>{r.completedAt ? formatDateTime(r.completedAt, tz, ctx.organization.locale) : "—"}</dd>
                </div>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Logged by</dt>
                <dd>{r.reportedBy?.name ?? "—"}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
