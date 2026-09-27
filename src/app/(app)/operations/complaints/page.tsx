import { CheckCircle2, Clock, MessageSquareWarning, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ComplaintsTable } from "@/components/operations/complaints-table";
import { NewComplaintDialog } from "@/components/operations/complaint-dialog";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { getComplaintSummary, listComplaints } from "@/services/operations/complaint-service";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { complaintCategoryLabels, complaintStatusLabels, optionsFrom, priorityLabels } from "@/config/labels";
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, PRIORITIES } from "@/lib/validation/operations";

export const metadata = { title: "Complaints" };

function formatHours(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

export default async function ComplaintsPage({ searchParams }: PageProps<"/operations/complaints">) {
  const ctx = await requireTenantPage("complaints.view");
  const params = await searchParams;
  const canManage = can(ctx, "complaints.manage");
  const filters = {
    q: sp(params, "q"),
    status: spEnum(params, "status", COMPLAINT_STATUSES),
    priority: spEnum(params, "priority", PRIORITIES),
    category: spEnum(params, "category", COMPLAINT_CATEGORIES),
  };
  const [summary, data, hostels] = await Promise.all([
    getComplaintSummary(ctx),
    listComplaints(ctx, {
      ...filters,
      sort: spEnum(params, "sort", ["createdAt", "priority", "status", "complaintNumber"] as const),
      dir: spEnum(params, "dir", ["asc", "desc"] as const),
      page: spNumber(params, "page", 1),
      pageSize: spNumber(params, "pageSize", 20),
    }),
    canManage ? listHostelOptions(ctx) : Promise.resolve([]),
  ]);
  const activeHostels = hostels.filter((h) => h.status !== "ARCHIVED").map((h) => ({ id: h.id, name: h.name }));
  const defaultHostelId = ctx.activeHostelId && activeHostels.some((h) => h.id === ctx.activeHostelId) ? ctx.activeHostelId : null;

  const newButton =
    canManage && activeHostels.length ? (
      <NewComplaintDialog
        hostels={activeHostels}
        defaultHostelId={defaultHostelId}
        trigger={
          <Button>
            <Plus />
            Log complaint
          </Button>
        }
      />
    ) : null;

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Track resident complaints from report to resolution."
        breadcrumbs={[{ label: "Operations" }, { label: "Complaints" }]}
        actions={newButton}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open" value={summary.byStatus.OPEN} icon={MessageSquareWarning} tone="warning" hint={`${summary.open} awaiting resolution`} />
        <StatCard label="Under review / in progress" value={summary.byStatus.UNDER_REVIEW + summary.byStatus.IN_PROGRESS} icon={Search} tone="info" />
        <StatCard label="Resolved (30 days)" value={summary.resolvedLast30} icon={CheckCircle2} tone="success" hint={`${summary.byStatus.CLOSED} closed overall`} />
        <StatCard label="Avg. resolution time" value={formatHours(summary.avgResolutionHours)} icon={Clock} hint="Last 30 days" />
      </div>
      <ComplaintsTable
        data={data}
        showHostel={!ctx.activeHostelId && ctx.accessibleHostelIds.length > 1}
        filters={[
          { key: "status", label: "Status", options: optionsFrom(complaintStatusLabels) },
          { key: "priority", label: "Priority", options: optionsFrom(priorityLabels) },
          { key: "category", label: "Category", options: optionsFrom(complaintCategoryLabels) },
        ]}
        emptyAction={newButton}
        filtered={!!(filters.q || filters.status || filters.priority || filters.category)}
      />
    </>
  );
}
