import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { can } from "@/lib/tenant/context";
import { employmentTypeLabels, staffStatusLabels, staffTypeLabels } from "@/config/labels";
import { listStaffForExport } from "@/services/staff/staff-service";
import { exportFormatFromParams, staffFiltersFromParams } from "@/services/staff/params";

type Row = Awaited<ReturnType<typeof listStaffForExport>>[number];

/** GET /api/staff/export?format=csv|xlsx&… (same filters as the staff list) */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = searchParamsObject(req);
  const rows = await listStaffForExport(ctx, staffFiltersFromParams(params));
  const columns: ExportColumn<Row>[] = [
    { header: "Employee code", value: (r) => r.employeeCode, width: 14 },
    { header: "First name", value: (r) => r.firstName, width: 16 },
    { header: "Last name", value: (r) => r.lastName, width: 16 },
    { header: "Designation", value: (r) => staffTypeLabels[r.designation], width: 16 },
    { header: "Department", value: (r) => r.department },
    { header: "Employment type", value: (r) => employmentTypeLabels[r.employmentType], width: 16 },
    { header: "Status", value: (r) => (r.archivedAt ? `Archived (${staffStatusLabels[r.status]})` : staffStatusLabels[r.status]), width: 18 },
    { header: "Primary hostel", value: (r) => r.hostels.find((h) => h.isPrimary)?.hostel.name ?? r.hostels[0]?.hostel.name, width: 20 },
    { header: "Hostels", value: (r) => r.hostels.map((h) => h.hostel.name).join(", "), width: 28 },
    { header: "Phone", value: (r) => r.phone, width: 16 },
    { header: "Email", value: (r) => r.email, width: 24 },
    { header: "ID number", value: (r) => r.idNumber, width: 16 },
    { header: "Joining date", value: (r) => r.joiningDate, width: 14 },
    ...(can(ctx, "payroll.view")
      ? [{ header: `Salary (${ctx.organization.currency})`, value: (r: Row) => r.salary ?? 0, width: 14 }]
      : []),
  ];
  return exportResponse(exportFormatFromParams(params), "staff", columns, rows);
});
