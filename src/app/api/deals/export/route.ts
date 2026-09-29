import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { formatDate, formatDateTime } from "@/lib/format";
import { dealStageLabels, dealTypeLabels } from "@/config/real-estate-labels";
import type { DealFilters } from "@/lib/validation/real-estate";
import { exportDeals } from "@/services/real-estate/deal-service";

type Row = Awaited<ReturnType<typeof exportDeals>>[number];

/** GET /api/deals/export?format=csv|xlsx&…list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const { format, ...filters } = searchParamsObject(req);
  const rows = await exportDeals(ctx, filters as DealFilters);
  const tz = ctx.organization.timezone;
  const columns: ExportColumn<Row>[] = [
    { header: "Deal #", value: (r) => r.code, width: 14 },
    { header: "Client", value: (r) => r.clientName, width: 24 },
    { header: "Type", value: (r) => dealTypeLabels[r.type] },
    { header: "Stage", value: (r) => dealStageLabels[r.stage] },
    { header: "Listing", value: (r) => (r.listing ? `${r.listing.code} · ${r.listing.title}` : ""), width: 36 },
    { header: "Lead", value: (r) => (r.lead ? `${r.lead.name} (${r.lead.code})` : ""), width: 24 },
    { header: `Agreed amount (${ctx.organization.currency})`, value: (r) => r.agreedAmount, width: 20 },
    { header: "Commission %", value: (r) => r.commissionPercent },
    { header: `Commission (${ctx.organization.currency})`, value: (r) => r.commissionAmount, width: 18 },
    { header: "Commission paid on", value: (r) => (r.commissionPaidAt ? formatDate(r.commissionPaidAt) : ""), width: 18 },
    { header: "Agent", value: (r) => r.agent?.name ?? "", width: 20 },
    { header: "Expected close", value: (r) => (r.expectedCloseDate ? formatDate(r.expectedCloseDate) : "") },
    { header: "Closed", value: (r) => (r.closedAt ? formatDateTime(r.closedAt, tz) : ""), width: 22 },
    { header: "Created", value: (r) => formatDateTime(r.createdAt, tz), width: 22 },
  ];
  return exportResponse(format === "xlsx" ? "xlsx" : "csv", "deals", columns, rows);
});
