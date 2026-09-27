import { MessageSquareWarning, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { ComplaintDialog } from "@/components/portal/complaint-dialog";
import { ListPagination } from "@/components/portal/list-pagination";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { spNumber } from "@/lib/page-helpers";
import { listPortalComplaints } from "@/services/portal/complaint-service";
import { complaintCategoryLabels, complaintStatusLabels, complaintStatusTones, priorityLabels, priorityTones } from "@/config/labels";

export const metadata = { title: "Complaints" };

export default async function PortalComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireResidentPage();
  const params = await searchParams;
  const data = await listPortalComplaints(ctx, { page: spNumber(params, "page", 1) });
  const fmt = portalFormatters(ctx);
  const newButton = (
    <Button>
      <Plus />
      New complaint
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Raise a concern with the hostel team and follow its progress."
        actions={<ComplaintDialog trigger={newButton} />}
      />
      {data.items.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="No complaints"
          description="If something isn't right — food, noise, cleanliness or staff — let the hostel team know."
          action={<ComplaintDialog trigger={newButton} />}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((c) => (
            <li key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{c.complaintNumber}</span> · {complaintCategoryLabels[c.category]} · {fmt.date(c.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <EnumBadge value={c.priority} labels={priorityLabels} tones={priorityTones} />
                  <EnumBadge value={c.status} labels={complaintStatusLabels} tones={complaintStatusTones} />
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{c.description}</p>
              {c.resolution ? (
                <div className="mt-3 rounded-lg border-s-2 border-success bg-success-soft/50 px-3 py-2 text-sm">
                  <p className="text-xs font-medium text-success">
                    Resolution{c.resolvedAt ? ` · ${fmt.date(c.resolvedAt)}` : ""}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line">{c.resolution}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ListPagination basePath="/portal/complaints" page={data.page} pageCount={data.pageCount} total={data.total} />
    </>
  );
}
