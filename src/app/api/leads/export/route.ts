import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { formatDate, formatDateTime } from "@/lib/format";
import { leadSourceLabels, leadStageLabels } from "@/config/real-estate-labels";
import type { LeadFilters } from "@/lib/validation/real-estate";
import { exportLeads } from "@/services/real-estate/lead-service";

type Row = Awaited<ReturnType<typeof exportLeads>>[number];

/** GET /api/leads/export?format=csv|xlsx&…list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const { format, ...filters } = searchParamsObject(req);
  const rows = await exportLeads(ctx, filters as LeadFilters);
  const tz = ctx.organization.timezone;
  const columns: ExportColumn<Row>[] = [
    { header: "Lead #", value: (r) => r.code, width: 14 },
    { header: "Name", value: (r) => r.name, width: 24 },
    { header: "Phone", value: (r) => r.phone ?? "", width: 18 },
    { header: "Email", value: (r) => r.email ?? "", width: 26 },
    { header: "Source", value: (r) => leadSourceLabels[r.source] },
    { header: "Stage", value: (r) => leadStageLabels[r.stage] },
    { header: "Looking to", value: (r) => (r.interest === "SALE" ? "Buy" : r.interest === "RENT" ? "Rent" : "") },
    { header: "Listing", value: (r) => (r.listing ? `${r.listing.code} · ${r.listing.title}` : ""), width: 36 },
    { header: "Budget from", value: (r) => r.budgetMin ?? "" },
    { header: "Budget to", value: (r) => r.budgetMax ?? "" },
    { header: "Preferred location", value: (r) => r.preferredLocation ?? "", width: 22 },
    { header: "Assigned to", value: (r) => r.assignedTo?.name ?? "", width: 20 },
    { header: "Next follow-up", value: (r) => (r.nextFollowUpAt ? formatDate(r.nextFollowUpAt) : "") },
    { header: "Last contacted", value: (r) => (r.lastContactedAt ? formatDateTime(r.lastContactedAt, tz) : ""), width: 22 },
    { header: "Lost reason", value: (r) => r.lostReason ?? "", width: 30 },
    { header: "Added", value: (r) => formatDateTime(r.createdAt, tz), width: 22 },
  ];
  return exportResponse(format === "xlsx" ? "xlsx" : "csv", "leads", columns, rows);
});
