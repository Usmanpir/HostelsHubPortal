import { tenantRoute } from "@/lib/api/handler";
import { exportResponse, type ExportColumn } from "@/lib/export";
import { genderLabels, residentStatusLabels } from "@/config/labels";
import { canAny } from "@/lib/tenant/context";
import { exportResidents } from "@/services/resident/resident-service";
import { parseResidentFilters } from "@/services/resident/filters";

type Row = Awaited<ReturnType<typeof exportResidents>>[number];

/** GET /api/residents/export?format=csv|xlsx&…list filters */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = req.nextUrl.searchParams;
  const rows = await exportResidents(ctx, parseResidentFilters(params));
  const balanceColumns: ExportColumn<Row>[] = canAny(ctx, "invoices.view", "payments.view")
    ? [
        { header: "Outstanding", value: (r) => r.balance?.outstanding ?? 0 },
        { header: "Credit", value: (r) => r.balance?.credit ?? 0 },
        { header: "Balance", value: (r) => r.balance?.balance ?? 0 },
      ]
    : [];
  const columns: ExportColumn<Row>[] = [
    { header: "Code", value: (r) => r.residentCode },
    { header: "First name", value: (r) => r.firstName, width: 16 },
    { header: "Last name", value: (r) => r.lastName, width: 16 },
    { header: "Phone", value: (r) => r.phone, width: 16 },
    { header: "Email", value: (r) => r.email, width: 26 },
    { header: "CNIC / ID", value: (r) => r.idNumber, width: 18 },
    { header: "Gender", value: (r) => (r.gender ? genderLabels[r.gender] : "") },
    { header: "Hostel", value: (r) => r.hostel.name, width: 20 },
    { header: "Room", value: (r) => r.stay?.room.roomNumber },
    { header: "Bed", value: (r) => r.stay?.bed.bedNumber },
    { header: "Monthly rent", value: (r) => r.stay?.monthlyRent ?? null },
    { header: "Deposit", value: (r) => r.stay?.securityDeposit ?? null },
    { header: "Check-in", value: (r) => r.stay?.checkInDate ?? null },
    { header: "Joining date", value: (r) => r.joiningDate },
    { header: "Expected leaving", value: (r) => r.expectedLeavingDate },
    { header: "Left on", value: (r) => r.actualLeavingDate },
    { header: "Occupation", value: (r) => r.occupation, width: 18 },
    { header: "Institution", value: (r) => r.institution, width: 20 },
    { header: "Status", value: (r) => residentStatusLabels[r.status] },
    ...balanceColumns,
  ];
  return exportResponse(params.get("format") === "xlsx" ? "xlsx" : "csv", "residents", columns, rows);
});
