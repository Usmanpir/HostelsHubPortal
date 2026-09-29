import { tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { paymentMethodLabels } from "@/config/labels";
import { ownerPayoutStatusLabels } from "@/config/owner-labels";
import { exportFormat, parsePayoutFilters } from "@/services/owners/filters";
import { listPayoutsForExport, type PayoutItem } from "@/services/owners/payout-service";

const columns: ExportColumn<PayoutItem>[] = [
  { header: "Owner code", value: (r) => r.owner.ownerCode },
  { header: "Owner", value: (r) => r.owner.name, width: 24 },
  { header: "Period start", value: (r) => r.periodStart },
  { header: "Period end", value: (r) => r.periodEnd },
  { header: "Rent collected", value: (r) => r.rentCollected },
  { header: "Expenses", value: (r) => r.expenses },
  { header: "Management fee", value: (r) => r.commission },
  { header: "Adjustments", value: (r) => r.adjustments },
  { header: "Net payable", value: (r) => r.netPayable },
  { header: "Status", value: (r) => ownerPayoutStatusLabels[r.status] },
  { header: "Paid on", value: (r) => r.paidAt },
  { header: "Method", value: (r) => (r.paymentMethod ? paymentMethodLabels[r.paymentMethod] : null) },
  { header: "Reference", value: (r) => r.reference, width: 18 },
  { header: "Notes", value: (r) => r.notes, width: 40 },
  { header: "Created by", value: (r) => r.createdBy, width: 20 },
  { header: "Created at", value: (r) => r.createdAt },
];

/** GET /api/owners/payouts/export?format=csv|xlsx + the list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = req.nextUrl.searchParams;
  const rows = await listPayoutsForExport(ctx, parsePayoutFilters(params));
  return exportResponse(exportFormat(params), "owner-payouts", columns, rows);
});
