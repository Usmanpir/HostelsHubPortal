import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { formatDateTime, fullName } from "@/lib/format";
import { maintenanceCategoryLabels, maintenanceStatusLabels, priorityLabels } from "@/config/labels";
import { exportMaintenance } from "@/services/operations/maintenance-service";
import type { MaintenanceFilters } from "@/lib/validation/operations";

type Row = Awaited<ReturnType<typeof exportMaintenance>>[number];

/** GET /api/maintenance/export?format=csv|xlsx&…list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const { format, ...filters } = searchParamsObject(req);
  const rows = await exportMaintenance(ctx, filters as MaintenanceFilters);
  const tz = ctx.organization.timezone;
  const columns: ExportColumn<Row>[] = [
    { header: "Request #", value: (r) => r.requestNumber, width: 14 },
    { header: "Title", value: (r) => r.title, width: 36 },
    { header: "Hostel", value: (r) => r.hostel.name, width: 22 },
    { header: "Room", value: (r) => r.room?.roomNumber ?? "" },
    { header: "Bed", value: (r) => r.bed?.bedNumber ?? "" },
    { header: "Resident", value: (r) => (r.resident ? `${fullName(r.resident)} (${r.resident.residentCode})` : ""), width: 26 },
    { header: "Category", value: (r) => maintenanceCategoryLabels[r.category] },
    { header: "Priority", value: (r) => priorityLabels[r.priority] },
    { header: "Status", value: (r) => maintenanceStatusLabels[r.status] },
    { header: "Assigned to", value: (r) => (r.assignedStaff ? fullName(r.assignedStaff) : ""), width: 22 },
    { header: "Reported", value: (r) => formatDateTime(r.createdAt, tz), width: 22 },
    { header: "Completed", value: (r) => (r.completedAt ? formatDateTime(r.completedAt, tz) : ""), width: 22 },
    { header: "Resolution notes", value: (r) => r.resolutionNotes ?? "", width: 40 },
  ];
  return exportResponse(format === "xlsx" ? "xlsx" : "csv", "maintenance-requests", columns, rows);
});
