import { tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { listInvoicesForExport, type InvoiceListItem } from "@/services/finance/invoice-service";
import { exportFormat, parseInvoiceFilters } from "@/services/finance/filters";
import { invoiceStatusLabels } from "@/config/labels";

const columns: ExportColumn<InvoiceListItem>[] = [
  { header: "Invoice", value: (r) => r.invoiceNumber, width: 16 },
  { header: "Resident", value: (r) => r.resident.name, width: 24 },
  { header: "Resident code", value: (r) => r.resident.code, width: 14 },
  { header: "Hostel", value: (r) => r.hostel.name, width: 22 },
  { header: "Period start", value: (r) => r.periodStart },
  { header: "Period end", value: (r) => r.periodEnd },
  { header: "Issue date", value: (r) => r.issueDate },
  { header: "Due date", value: (r) => r.dueDate },
  { header: "Total", value: (r) => r.total },
  { header: "Paid", value: (r) => r.amountPaid },
  { header: "Balance", value: (r) => r.balance },
  { header: "Status", value: (r) => invoiceStatusLabels[r.status] },
];

/** GET /api/invoices/export?format=csv|xlsx + the list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = req.nextUrl.searchParams;
  const rows = await listInvoicesForExport(ctx, parseInvoiceFilters(params));
  return exportResponse(exportFormat(params), "invoices", columns, rows);
});
