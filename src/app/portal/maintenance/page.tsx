import { Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { MaintenanceDialog } from "@/components/portal/maintenance-dialog";
import { ListPagination } from "@/components/portal/list-pagination";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { spNumber } from "@/lib/page-helpers";
import { listPortalMaintenance } from "@/services/portal/maintenance-service";
import { currentAssignment } from "@/services/portal/shared";
import { maintenanceCategoryLabels, maintenanceStatusLabels, maintenanceStatusTones, priorityLabels, priorityTones } from "@/config/labels";

export const metadata = { title: "Maintenance" };

export default async function PortalMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireResidentPage();
  const params = await searchParams;
  const [data, assignment] = await Promise.all([
    listPortalMaintenance(ctx, { page: spNumber(params, "page", 1) }),
    currentAssignment(ctx),
  ]);
  const fmt = portalFormatters(ctx);
  const location =
    assignment?.status === "ACTIVE" ? `room ${assignment.room.roomNumber}, bed ${assignment.bed.bedNumber}` : null;
  const newButton = (
    <Button>
      <Plus />
      Report an issue
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Report broken fixtures, leaks, electrical or internet problems."
        actions={<MaintenanceDialog trigger={newButton} location={location} />}
      />
      {data.items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No maintenance requests"
          description="Something broken? Report it with a photo and staff will take care of it."
          action={<MaintenanceDialog trigger={newButton} location={location} />}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((m) => (
            <li key={m.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{m.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{m.requestNumber}</span> · {maintenanceCategoryLabels[m.category]}
                    {m.room ? ` · Room ${m.room.roomNumber}${m.bed ? `, bed ${m.bed.bedNumber}` : ""}` : ""} · {fmt.date(m.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <EnumBadge value={m.priority} labels={priorityLabels} tones={priorityTones} />
                  <EnumBadge value={m.status} labels={maintenanceStatusLabels} tones={maintenanceStatusTones} />
                </div>
              </div>
              {m.description ? <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{m.description}</p> : null}
              {m.photos.length ? (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {m.photos.map((photo) => (
                    <a
                      key={photo.id}
                      href={`/api/files/${photo.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 overflow-hidden rounded-lg border"
                      aria-label={`Open photo ${photo.originalName}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file route */}
                      <img src={`/api/files/${photo.id}`} alt={photo.originalName} className="size-16 object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              ) : null}
              {m.resolutionNotes && (m.status === "COMPLETED" || m.status === "REJECTED") ? (
                <div
                  className={
                    m.status === "COMPLETED"
                      ? "mt-3 rounded-lg border-s-2 border-success bg-success-soft/50 px-3 py-2 text-sm"
                      : "mt-3 rounded-lg border-s-2 border-muted-foreground/40 bg-muted px-3 py-2 text-sm"
                  }
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {m.status === "COMPLETED" ? "Resolved" : "Not actioned"}
                    {m.completedAt ? ` · ${fmt.date(m.completedAt)}` : ""}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line">{m.resolutionNotes}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ListPagination basePath="/portal/maintenance" page={data.page} pageCount={data.pageCount} total={data.total} />
    </>
  );
}
