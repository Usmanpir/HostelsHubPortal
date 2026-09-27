import { tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { listExpensesForExport, type ExpenseItem } from "@/services/finance/expense-service";
import { exportFormat, parseExpenseFilters } from "@/services/finance/filters";
import { expenseStatusLabels, paymentMethodLabels } from "@/config/labels";

const columns: ExportColumn<ExpenseItem>[] = [
  { header: "Date", value: (r) => r.date },
  { header: "Hostel", value: (r) => r.hostel.name, width: 22 },
  { header: "Category", value: (r) => r.category.name, width: 18 },
  { header: "Vendor", value: (r) => r.vendor, width: 22 },
  { header: "Description", value: (r) => r.description, width: 40 },
  { header: "Method", value: (r) => paymentMethodLabels[r.paymentMethod] },
  { header: "Reference", value: (r) => r.reference, width: 18 },
  { header: "Amount", value: (r) => r.amount },
  { header: "Status", value: (r) => expenseStatusLabels[r.status] },
  { header: "Void reason", value: (r) => r.voidReason, width: 30 },
  { header: "Recorded by", value: (r) => r.createdBy, width: 20 },
];

/** GET /api/expenses/export?format=csv|xlsx + the list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = req.nextUrl.searchParams;
  const rows = await listExpensesForExport(ctx, parseExpenseFilters(params));
  return exportResponse(exportFormat(params), "expenses", columns, rows);
});
