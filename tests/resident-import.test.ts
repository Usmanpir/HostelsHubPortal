import { describe, expect, it, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import { IMPORT_COLUMNS } from "@/lib/validation/resident-import";
import { importResidentBatch, parseImportDate, parseImportFile, previewResidentImport } from "@/services/resident/import-service";
import { addMember, createHostelWithRoom, createTenant, prisma } from "./helpers";

const enc = (s: string) => new TextEncoder().encode(s);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

describe("resident bulk import", () => {
  let ctx: TenantContext;
  let hostelCode: string;
  let roomNumber: string;
  let otherHostelCode: string;

  beforeAll(async () => {
    const t = await createTenant("Import Org");
    const s = await createHostelWithRoom(t.ctx, 2, 12000);
    ctx = s.ctx;
    hostelCode = s.hostel.code;
    roomNumber = s.room.roomNumber;
    const other = await createTenant("Import Other Org");
    otherHostelCode = (await createHostelWithRoom(other.ctx)).hostel.code;
  });

  const csv = (rows: string[][]) =>
    enc(["Hostel,First name,Last name,Phone,Joining date,Status,Room,Bed,CNIC / Passport,Email", ...rows.map((r) => r.join(","))].join("\r\n"));

  it("parses CSV with quotes, BOM, semicolons and header synonyms", async () => {
    const semi = enc('﻿hostel code;First Name;SURNAME;Mobile;Admission date;Notes\nH1;"Ali";"Khan";0300 1234567;15/01/2026;"said ""hi""; ok"\n');
    const { rows } = await parseImportFile(semi, "x.csv");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data).toMatchObject({ hostel: "H1", firstName: "Ali", lastName: "Khan", phone: "0300 1234567", joiningDate: "15/01/2026", notes: 'said "hi"; ok' });
    expect(rows[0]!.rowNumber).toBe(2);
  });

  it("parses Excel files, including real date cells", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Residents");
    sheet.addRow(IMPORT_COLUMNS.map((c) => c.header));
    const values: Record<string, unknown> = { hostel: "H1", firstName: "Sara", lastName: "Ali", phone: "+923001112233", joiningDate: new Date("2026-02-03T00:00:00Z") };
    sheet.addRow(IMPORT_COLUMNS.map((c) => values[c.key] ?? null));
    const bytes = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const { rows } = await parseImportFile(bytes, "residents.xlsx");
    expect(rows[0]!.data).toMatchObject({ firstName: "Sara", joiningDate: "2026-02-03" });
  });

  it("rejects files without required columns or with unsupported types", async () => {
    await expect(parseImportFile(enc("Name,Phone\nAli,123"), "a.csv")).rejects.toBeInstanceOf(ValidationError);
    await expect(parseImportFile(enc("x"), "a.pdf")).rejects.toBeInstanceOf(ValidationError);
  });

  it("parses common date formats and rejects impossible dates", () => {
    expect(parseImportDate("2026-01-05")).toBe("2026-01-05");
    expect(parseImportDate("05/01/2026")).toBe("2026-01-05");
    expect(parseImportDate("5-1-26")).toBe("2026-01-05");
    expect(parseImportDate("46027")).toBe("2026-01-05"); // Excel serial date
    expect(parseImportDate("31/02/2026")).toBeNull();
    expect(parseImportDate("soon")).toBeNull();
  });

  it("previews rows with errors, duplicates and bed validation", async () => {
    const joined = daysAgo(30);
    const preview = await previewResidentImport(
      ctx,
      csv([
        [hostelCode, "Ali", "Raza", "+923001110001", joined, "Active", roomNumber, "1", "61101-1111111-1", "ali@example.com"],
        [hostelCode, "Bilal", "Ahmed", "+923001110002", joined, "Active", roomNumber, "1", "", ""], // same bed as row 2
        [hostelCode, "Ali", "Raza", "+923001110001", joined, "", "", "", "", ""], // duplicate of row 2 (phone + name)
        ["NOPE", "Zed", "X", "+923001110003", joined, "", "", "", "", ""], // unknown hostel
        [otherHostelCode, "Other", "Tenant", "+923001110004", joined, "", "", "", "", ""], // another tenant's hostel
        [hostelCode, "Bad", "Phone", "abc", "32/13/2026", "Unknown", "", "", "", ""],
        [hostelCode, "Room", "Missing", "+923001110005", joined, "", "999", "1", "", ""],
      ]),
      "residents.csv",
    );
    const byRow = new Map(preview.rows.map((r) => [r.rowNumber, r]));
    expect(byRow.get(2)!.status).toBe("ready");
    expect(byRow.get(2)!.placement).toContain(`Room ${roomNumber} · Bed 1`);
    expect(byRow.get(3)!.status).toBe("invalid");
    expect(byRow.get(3)!.errors.join()).toMatch(/already used by row 2/);
    expect(byRow.get(4)!.status).toBe("duplicate");
    expect(byRow.get(5)!.errors.join()).toMatch(/wasn't found/);
    expect(byRow.get(6)!.errors.join()).toMatch(/wasn't found/); // other tenant's hostels are invisible
    expect(byRow.get(7)!.errors.length).toBeGreaterThanOrEqual(3);
    expect(byRow.get(8)!.errors.join()).toMatch(/doesn't exist/);
    expect(preview.counts).toMatchObject({ total: 7, ready: 1, duplicate: 1, invalid: 5 });
    // Preview writes nothing.
    expect(await prisma.resident.count({ where: { organizationId: ctx.organizationId } })).toBe(0);
  });

  it("imports ready rows with bed assignment, and a re-import reports duplicates", async () => {
    const joined = daysAgo(20);
    const rows = [
      { rowNumber: 2, data: { hostel: hostelCode, firstName: "Hamza", lastName: "Iqbal", phone: "+923002220001", joiningDate: joined, room: roomNumber, bed: "2", monthlyRent: "13,500", idNumber: "61101-2222222-2" } },
      { rowNumber: 3, data: { hostel: hostelCode, firstName: "Omar", lastName: "Farooq", phone: "+923002220002", joiningDate: joined, status: "Checked out", leavingDate: daysAgo(5) } },
      { rowNumber: 4, data: { hostel: hostelCode, firstName: "Usman", lastName: "Tariq", phone: "+923002220003", joiningDate: joined, status: "On notice" } },
    ];
    const results = await importResidentBatch(ctx, rows);
    expect(results.map((r) => r.outcome)).toEqual(["imported", "imported", "imported"]);

    const hamza = await prisma.resident.findFirstOrThrow({ where: { organizationId: ctx.organizationId, firstName: "Hamza" } });
    expect(hamza.residentCode).toMatch(/^RES-\d{4}$/);
    const stay = await prisma.residentAssignment.findFirstOrThrow({ where: { residentId: hamza.id, status: "ACTIVE" } });
    expect(Number(stay.monthlyRent)).toBe(13500);
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: stay.bedId } })).status).toBe("OCCUPIED");

    const omar = await prisma.resident.findFirstOrThrow({ where: { organizationId: ctx.organizationId, firstName: "Omar" } });
    expect(omar.status).toBe("CHECKED_OUT");
    expect(omar.actualLeavingDate).not.toBeNull();
    expect((await prisma.resident.findFirstOrThrow({ where: { organizationId: ctx.organizationId, firstName: "Usman" } })).status).toBe("NOTICE");

    // Sending the same batch again must not create anyone twice.
    const again = await importResidentBatch(ctx, rows);
    expect(again.every((r) => r.outcome === "duplicate")).toBe(true);
    expect(await prisma.resident.count({ where: { organizationId: ctx.organizationId, firstName: { in: ["Hamza", "Omar", "Usman"] } } })).toBe(3);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: ctx.organizationId, action: "resident.bulk_imported" } });
    expect(log).not.toBeNull();
  });

  it("reports an occupied bed and keeps failed rows from being half-created", async () => {
    const preview = await previewResidentImport(
      ctx,
      csv([[hostelCode, "Late", "Comer", "+923003330001", daysAgo(3), "", roomNumber, "2", "", ""]]),
      "b.csv",
    );
    expect(preview.rows[0]!.status).toBe("invalid");
    expect(preview.rows[0]!.errors.join()).toMatch(/occupied/);
    const results = await importResidentBatch(ctx, [{ rowNumber: 2, data: preview.rows[0]!.data }]);
    expect(results[0]!.outcome).toBe("skipped");
    expect(await prisma.resident.count({ where: { organizationId: ctx.organizationId, firstName: "Late" } })).toBe(0);
  });

  it("requires residents.manage, and bed placement requires assignments.manage", async () => {
    const accountant = await addMember(ctx, "ACCOUNTANT");
    await expect(previewResidentImport(accountant, csv([]), "a.csv")).rejects.toBeInstanceOf(ForbiddenError);

    // A custom role that can manage residents but not assign beds.
    const role = await prisma.role.create({
      data: {
        organizationId: ctx.organizationId,
        key: `IMPORTER_${Date.now()}`,
        name: "Importer",
        permissions: { create: [{ permission: "residents.manage" }, { permission: "residents.view" }] },
      },
    });
    const user = await prisma.user.create({ data: { name: "Importer", email: `importer-${Date.now()}@test.local`, passwordHash: "x" } });
    await prisma.organizationMember.create({ data: { organizationId: ctx.organizationId, userId: user.id, roleId: role.id, allHostels: true } });
    const { loadTenantContext } = await import("@/lib/tenant/context");
    const importer = (await loadTenantContext(prisma, { userId: user.id, preferredOrganizationId: ctx.organizationId }))!;
    const preview = await previewResidentImport(importer, csv([[hostelCode, "No", "Bedright", "+923004440001", daysAgo(2), "", roomNumber, "1", "", ""]]), "c.csv");
    expect(preview.rows[0]!.errors.join()).toMatch(/can't assign beds/);
  });
});
