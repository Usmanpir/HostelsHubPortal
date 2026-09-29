import ExcelJS from "exceljs";
import { tenantRoute } from "@/lib/api/handler";
import { requirePermission } from "@/lib/tenant/context";
import { toCsv } from "@/lib/export";
import { IMPORT_COLUMNS } from "@/lib/validation/resident-import";
import { listHostelOptions } from "@/services/hostel/hostel-service";

/** GET /api/residents/import/template?format=xlsx|csv — blank template with an example row. */
export const GET = tenantRoute(async ({ req, ctx }) => {
  requirePermission(ctx, "residents.manage");
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const hostels = await listHostelOptions(ctx);
  const example: Record<string, string> = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.example]));
  if (hostels[0]) example.hostel = hostels[0].code;

  if (format === "csv") {
    const csv = toCsv(
      IMPORT_COLUMNS.map((c) => ({ header: c.header, value: (row: Record<string, string>) => row[c.key] })),
      [example],
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="resident-import-template.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Residents");
  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  IMPORT_COLUMNS.forEach((c, i) => {
    if (c.required) sheet.getRow(1).getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    if ("hint" in c) sheet.getRow(1).getCell(i + 1).note = c.hint;
  });
  sheet.addRow(example);
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const guide = workbook.addWorksheet("Instructions");
  guide.columns = [
    { header: "Column", key: "column", width: 28 },
    { header: "Required", key: "required", width: 10 },
    { header: "Notes", key: "notes", width: 70 },
  ];
  guide.getRow(1).font = { bold: true };
  for (const c of IMPORT_COLUMNS) guide.addRow({ column: c.header, required: c.required ? "Yes" : "", notes: "hint" in c ? c.hint : "" });
  guide.addRow({});
  guide.addRow({ column: "Your hostels", notes: hostels.map((h) => `${h.code} = ${h.name}`).join(", ") || "Create a hostel first" });
  guide.addRow({ column: "Tip", notes: "Delete the example row before uploading. One resident per row; the header row must stay." });

  const bytes = new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="resident-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
});
