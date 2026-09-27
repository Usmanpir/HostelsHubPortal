import { CalendarRange, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { RequestDialog } from "@/components/portal/request-dialog";
import { CancelRequestButton } from "@/components/portal/cancel-request-button";
import { ListPagination } from "@/components/portal/list-pagination";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { spNumber } from "@/lib/page-helpers";
import { listPortalRequests } from "@/services/portal/request-service";
import { approvalStatusLabels, approvalStatusTones, residentRequestTypeLabels } from "@/config/labels";

export const metadata = { title: "Requests" };

export default async function PortalRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireResidentPage();
  const params = await searchParams;
  const data = await listPortalRequests(ctx, { page: spNumber(params, "page", 1) });
  const fmt = portalFormatters(ctx);
  const newButton = (
    <Button>
      <Plus />
      New request
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Requests"
        description="Room changes, leave and other requests to the hostel office."
        actions={<RequestDialog trigger={newButton} />}
      />
      {data.items.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No requests yet"
          description="Ask for a room change, tell the office you're going on leave, or anything else."
          action={<RequestDialog trigger={newButton} />}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{r.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {residentRequestTypeLabels[r.type]} · Submitted {fmt.date(r.createdAt)}
                  </p>
                </div>
                <EnumBadge value={r.status} labels={approvalStatusLabels} tones={approvalStatusTones} />
              </div>
              {r.type === "LEAVE" && r.startDate && r.endDate ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm">
                  <CalendarRange className="size-4 text-muted-foreground" />
                  {fmt.date(r.startDate)} – {fmt.date(r.endDate)}
                </p>
              ) : null}
              {r.details ? <p className="mt-2 line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{r.details}</p> : null}
              {r.response ? (
                <div className="mt-3 rounded-lg border-s-2 border-primary bg-muted/60 px-3 py-2 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    Office response{r.reviewedAt ? ` · ${fmt.date(r.reviewedAt)}` : ""}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line">{r.response}</p>
                </div>
              ) : null}
              {r.status === "PENDING" ? (
                <div className="mt-2 flex justify-end">
                  <CancelRequestButton id={r.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ListPagination basePath="/portal/requests" page={data.page} pageCount={data.pageCount} total={data.total} />
    </>
  );
}
