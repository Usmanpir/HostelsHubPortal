import { tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { assignmentStatusLabels } from "@/config/labels";
import { fullName } from "@/lib/format";
import { exportAssignments } from "@/services/resident/assignment-service";
import { parseAssignmentFilters } from "@/services/resident/filters";

type Row = Awaited<ReturnType<typeof exportAssignments>>[number];

/** GET /api/assignments/export?format=csv|xlsx&…list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = req.nextUrl.searchParams;
  const rows = await exportAssignments(ctx, parseAssignmentFilters(params));
  const columns: ExportColumn<Row>[] = [
    { header: "Resident", value: (r) => fullName(r.resident), width: 24 },
    { header: "Code", value: (r) => r.resident.residentCode },
    { header: "Phone", value: (r) => r.resident.phone, width: 16 },
    { header: "Hostel", value: (r) => r.hostel.name, width: 20 },
    { header: "Room", value: (r) => r.room.roomNumber },
    { header: "Bed", value: (r) => r.bed.bedNumber },
    { header: "Status", value: (r) => assignmentStatusLabels[r.status] },
    { header: "Check-in", value: (r) => r.checkInDate },
    { header: "Check-out", value: (r) => r.checkOutDate },
    { header: "Monthly rent", value: (r) => r.monthlyRent },
    { header: "Deposit", value: (r) => r.securityDeposit },
    { header: "Final charges", value: (r) => r.finalCharges },
    { header: "Deposit deduction", value: (r) => r.depositDeduction },
    { header: "Deposit refund", value: (r) => r.depositRefund },
    { header: "Meter reading", value: (r) => r.meterReading },
    { header: "End reason", value: (r) => r.endReason, width: 28 },
  ];
  return exportResponse(params.get("format") === "xlsx" ? "xlsx" : "csv", "stays", columns, rows);
});
