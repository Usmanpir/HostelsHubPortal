import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { formatDateTime, fullName } from "@/lib/format";
import { exportVisitors } from "@/services/operations/visitor-service";
import type { VisitorFilters } from "@/lib/validation/operations";

type Row = Awaited<ReturnType<typeof exportVisitors>>[number];

function duration(r: Row) {
  if (!r.checkOutAt) return "";
  const minutes = Math.max(0, Math.round((r.checkOutAt.getTime() - r.checkInAt.getTime()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

/** GET /api/visitors/export?format=csv|xlsx&…log filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const { format, ...filters } = searchParamsObject(req);
  const rows = await exportVisitors(ctx, filters as VisitorFilters);
  const tz = ctx.organization.timezone;
  const columns: ExportColumn<Row>[] = [
    { header: "Visitor", value: (r) => r.name, width: 24 },
    { header: "Phone", value: (r) => r.phone ?? "", width: 16 },
    { header: "CNIC / ID", value: (r) => r.idNumber ?? "", width: 18 },
    { header: "Hostel", value: (r) => r.hostel.name, width: 22 },
    { header: "Visiting", value: (r) => (r.resident ? `${fullName(r.resident)} (${r.resident.residentCode})` : ""), width: 26 },
    { header: "Purpose", value: (r) => r.purpose ?? "", width: 26 },
    { header: "Checked in", value: (r) => formatDateTime(r.checkInAt, tz), width: 22 },
    { header: "Checked out", value: (r) => (r.checkOutAt ? formatDateTime(r.checkOutAt, tz) : "Inside"), width: 22 },
    { header: "Duration", value: duration },
    { header: "Recorded by", value: (r) => r.recordedBy?.name ?? "", width: 20 },
    { header: "Notes", value: (r) => r.notes ?? "", width: 30 },
  ];
  return exportResponse(format === "xlsx" ? "xlsx" : "csv", "visitor-log", columns, rows);
});
