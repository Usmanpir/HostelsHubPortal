import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { formatDateTime, fullName } from "@/lib/format";
import { complaintCategoryLabels, complaintStatusLabels, priorityLabels } from "@/config/labels";
import { exportComplaints } from "@/services/operations/complaint-service";
import type { ComplaintFilters } from "@/lib/validation/operations";

type Row = Awaited<ReturnType<typeof exportComplaints>>[number];

/** GET /api/complaints/export?format=csv|xlsx&…list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const { format, ...filters } = searchParamsObject(req);
  const rows = await exportComplaints(ctx, filters as ComplaintFilters);
  const tz = ctx.organization.timezone;
  const columns: ExportColumn<Row>[] = [
    { header: "Complaint #", value: (r) => r.complaintNumber, width: 14 },
    { header: "Title", value: (r) => r.title, width: 36 },
    { header: "Hostel", value: (r) => r.hostel.name, width: 22 },
    { header: "Resident", value: (r) => (r.resident ? `${fullName(r.resident)} (${r.resident.residentCode})` : ""), width: 26 },
    { header: "Category", value: (r) => complaintCategoryLabels[r.category] },
    { header: "Priority", value: (r) => priorityLabels[r.priority] },
    { header: "Status", value: (r) => complaintStatusLabels[r.status] },
    { header: "Assigned to", value: (r) => (r.assignedStaff ? fullName(r.assignedStaff) : ""), width: 22 },
    { header: "Submitted", value: (r) => formatDateTime(r.createdAt, tz), width: 22 },
    { header: "Resolved", value: (r) => (r.resolvedAt ? formatDateTime(r.resolvedAt, tz) : ""), width: 22 },
    { header: "Description", value: (r) => r.description, width: 50 },
    { header: "Resolution", value: (r) => r.resolution ?? "", width: 40 },
  ];
  return exportResponse(format === "xlsx" ? "xlsx" : "csv", "complaints", columns, rows);
});
