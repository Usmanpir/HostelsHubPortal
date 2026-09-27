import { tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { listPaymentsForExport, type PaymentListItem } from "@/services/finance/payment-service";
import { exportFormat, parsePaymentFilters } from "@/services/finance/filters";
import { paymentMethodLabels, paymentStatusLabels, paymentTypeLabels } from "@/config/labels";

const columns: ExportColumn<PaymentListItem>[] = [
  { header: "Receipt", value: (r) => r.receiptNumber, width: 16 },
  { header: "Date", value: (r) => r.paymentDate },
  { header: "Resident", value: (r) => r.resident.name, width: 24 },
  { header: "Resident code", value: (r) => r.resident.code, width: 14 },
  { header: "Hostel", value: (r) => r.hostel.name, width: 22 },
  { header: "Invoice", value: (r) => r.invoice?.invoiceNumber ?? "", width: 16 },
  { header: "Type", value: (r) => paymentTypeLabels[r.type] },
  { header: "Method", value: (r) => paymentMethodLabels[r.method] },
  { header: "Reference", value: (r) => r.reference, width: 18 },
  { header: "Amount", value: (r) => r.amount },
  { header: "Status", value: (r) => paymentStatusLabels[r.status] },
  { header: "Received by", value: (r) => r.receivedBy, width: 20 },
];

/** GET /api/payments/export?format=csv|xlsx + the list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = req.nextUrl.searchParams;
  const rows = await listPaymentsForExport(ctx, parsePaymentFilters(params));
  return exportResponse(exportFormat(params), "payments", columns, rows);
});
