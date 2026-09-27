import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { paymentMethodLabels, payrollStatusLabels, staffTypeLabels } from "@/config/labels";
import { monthKey } from "@/lib/validation/staff";
import { listPayrollForExport } from "@/services/staff/payroll-service";
import { exportFormatFromParams, payrollStatusFromParams, periodFromParams } from "@/services/staff/params";

type Row = Awaited<ReturnType<typeof listPayrollForExport>>[number];

/** GET /api/payroll/export?month=YYYY-MM&status=&q=&format=csv|xlsx */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = searchParamsObject(req);
  const period = periodFromParams(ctx, params);
  const rows = await listPayrollForExport(ctx, {
    ...period,
    status: payrollStatusFromParams(params),
    q: req.nextUrl.searchParams.get("q") ?? undefined,
    hostelId: req.nextUrl.searchParams.get("hostel") || req.nextUrl.searchParams.get("hostelId") || null,
  });
  const cur = ctx.organization.currency;
  const columns: ExportColumn<Row>[] = [
    { header: "Period", value: () => monthKey(period.year, period.month), width: 10 },
    { header: "Employee code", value: (r) => r.staff.employeeCode, width: 14 },
    { header: "Name", value: (r) => `${r.staff.firstName} ${r.staff.lastName}`, width: 22 },
    { header: "Designation", value: (r) => staffTypeLabels[r.staff.designation], width: 16 },
    { header: "Hostel", value: (r) => r.staff.hostels[0]?.hostel.name, width: 20 },
    { header: `Base salary (${cur})`, value: (r) => r.baseSalary, width: 14 },
    { header: `Allowances (${cur})`, value: (r) => r.allowances, width: 14 },
    { header: `Bonus (${cur})`, value: (r) => r.bonus, width: 12 },
    { header: `Deductions (${cur})`, value: (r) => r.deductions, width: 14 },
    { header: `Advances (${cur})`, value: (r) => r.advances, width: 13 },
    { header: `Net salary (${cur})`, value: (r) => r.netSalary, width: 14 },
    { header: "Status", value: (r) => payrollStatusLabels[r.status], width: 11 },
    { header: "Payment date", value: (r) => r.paymentDate, width: 13 },
    { header: "Method", value: (r) => (r.paymentMethod ? paymentMethodLabels[r.paymentMethod] : ""), width: 14 },
    { header: "Reference", value: (r) => r.reference, width: 16 },
    { header: "Notes", value: (r) => r.notes, width: 24 },
  ];
  return exportResponse(exportFormatFromParams(params), `payroll-${monthKey(period.year, period.month)}`, columns, rows);
});
