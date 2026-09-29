import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/prisma";
import { audit } from "@/lib/audit";
import { isAppError, ValidationError } from "@/lib/errors";
import { actorOf, can, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { residentSchema, type ResidentInput } from "@/lib/validation/resident";
import {
  columnForHeader,
  IMPORT_COLUMNS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  type ImportColumnKey,
  type ImportRowResult,
  type PreviewRow,
  type RawImportRow,
} from "@/lib/validation/resident-import";
import { todayInTimeZone } from "@/lib/format";
import { toNumber } from "@/lib/serialize";
import type { Gender, ResidentStatus } from "@/generated/prisma/enums";
import { createResident } from "./resident-service";
import { checkIn } from "./assignment-service";

// ─── File parsing ───────────────────────────────────────────────────────────

type ParsedFile = { rows: { rowNumber: number; data: RawImportRow }[]; unknownHeaders: string[] };

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return String(value);
}

/** RFC 4180 CSV (quoted fields, escaped quotes, CRLF), comma or semicolon separated. */
function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function readTable(bytes: Uint8Array, fileName: string): Promise<string[][]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(new TextDecoder("utf-8").decode(bytes));
  if (lower.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    } catch {
      throw new ValidationError("This Excel file couldn't be read. Save it as .xlsx or .csv and try again.");
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const table: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) values.push(cellText(row.getCell(c).value));
      table[rowNumber - 1] = values;
    });
    return Array.from(table, (r) => r ?? []);
  }
  throw new ValidationError("Upload an Excel (.xlsx) or CSV (.csv) file.");
}

export async function parseImportFile(bytes: Uint8Array, fileName: string): Promise<ParsedFile> {
  if (bytes.byteLength === 0) throw new ValidationError("The file is empty.");
  if (bytes.byteLength > MAX_IMPORT_FILE_BYTES) throw new ValidationError("The file is larger than 5 MB. Split it into smaller files.");
  const table = await readTable(bytes, fileName);
  const [header = [], ...body] = table;
  const columns = header.map((h) => columnForHeader(h.trim()));
  const unknownHeaders = header.filter((h, i) => h.trim() && !columns[i]).map((h) => h.trim());
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !columns.includes(c.key)).map((c) => c.header);
  if (missing.length) {
    throw new ValidationError(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected layout.`);
  }
  const rows: ParsedFile["rows"] = [];
  body.forEach((cells, i) => {
    const data: RawImportRow = {};
    columns.forEach((key, c) => {
      // A leading apostrophe is spreadsheet text-escaping, not data.
      const value = (cells[c] ?? "").trim().replace(/^'(?=\S)/, "");
      if (key && value) data[key] = value;
    });
    if (Object.keys(data).length) rows.push({ rowNumber: i + 2, data });
  });
  if (rows.length === 0) throw new ValidationError("No resident rows were found below the header row.");
  if (rows.length > MAX_IMPORT_ROWS) throw new ValidationError(`A file can contain at most ${MAX_IMPORT_ROWS} residents; this one has ${rows.length}.`);
  return { rows, unknownHeaders };
}

// ─── Field normalisation ────────────────────────────────────────────────────

const STATUS_ALIASES: Record<string, ResidentStatus> = {
  active: "ACTIVE",
  onnotice: "NOTICE",
  notice: "NOTICE",
  suspended: "SUSPENDED",
  checkedout: "CHECKED_OUT",
  left: "CHECKED_OUT",
  former: "CHECKED_OUT",
};
const GENDER_ALIASES: Record<string, Gender> = { male: "MALE", m: "MALE", female: "FEMALE", f: "FEMALE", other: "OTHER" };
const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and Excel serial numbers. */
export function parseImportDate(value: string | undefined): string | null | undefined {
  if (!value) return undefined;
  const v = value.trim();
  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;
  if ((match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else if (/^\d{5}(\.\d+)?$/.test(v)) {
    const date = new Date(Math.round((Number(v) - 25569) * 86400_000));
    return date.toISOString().slice(0, 10);
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function parseMoney(value: string | undefined): number | null | undefined {
  if (!value) return undefined;
  const n = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const normPhone = (p: string | undefined) => (p ?? "").replace(/\D/g, "").replace(/^0092|^92|^0/, "");
const normName = (f?: string, l?: string) => `${f ?? ""} ${l ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
const normId = (s: string | undefined) => (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

// ─── Validation (shared by preview and import) ──────────────────────────────

type ResolvedRow = PreviewRow & {
  input?: ResidentInput;
  bedId?: string;
  checkInDate?: string;
  monthlyRent?: number;
  securityDeposit?: number;
  leavingDate?: string;
  finalStatus?: ResidentStatus;
};

/**
 * Validate rows against the same rules as manual entry: resident schema,
 * hostel access, bed availability and room capacity, duplicates within the
 * file and against existing residents. Read-only.
 */
async function resolveRows(ctx: TenantContext, rows: { rowNumber: number; data: RawImportRow }[]): Promise<ResolvedRow[]> {
  const today = todayInTimeZone(ctx.organization.timezone || "UTC");
  const canAssign = can(ctx, "assignments.manage");

  const hostels = await prisma.hostel.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null, ...(ctx.allHostels ? {} : { id: { in: ctx.accessibleHostelIds } }) },
    select: { id: true, name: true, code: true, defaultBedRent: true, defaultDeposit: true },
  });
  const hostelByKey = new Map<string, (typeof hostels)[number]>();
  for (const h of hostels) {
    hostelByKey.set(h.code.toUpperCase(), h);
    hostelByKey.set(h.name.trim().toLowerCase(), h);
  }
  const findHostel = (v: string | undefined) => (v ? (hostelByKey.get(v.trim().toUpperCase()) ?? hostelByKey.get(v.trim().toLowerCase())) : undefined);

  // Rooms and beds of every referenced hostel, loaded once.
  const hostelIds = [...new Set(rows.map((r) => findHostel(r.data.hostel)?.id).filter((id): id is string => !!id))];
  const rooms = hostelIds.length
    ? await prisma.room.findMany({
        where: { organizationId: ctx.organizationId, hostelId: { in: hostelIds }, archivedAt: null },
        select: {
          id: true,
          hostelId: true,
          roomNumber: true,
          status: true,
          rent: true,
          capacity: true,
          beds: { where: { archivedAt: null }, select: { id: true, bedNumber: true, status: true, monthlyRent: true } },
          _count: { select: { assignments: { where: { status: { in: ["ACTIVE", "RESERVED"] } } } } },
        },
      })
    : [];
  const roomByKey = new Map(rooms.map((r) => [`${r.hostelId}|${r.roomNumber.trim().toLowerCase()}`, r]));

  // Identity fields of every current resident in the organization (one query), for duplicate checks.
  // Organization-wide on purpose: the same person must not be created twice in two hostels.
  const existing = await prisma.resident.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null },
    select: { residentCode: true, firstName: true, lastName: true, phone: true, email: true, idNumber: true },
  });
  const existingById = new Map(existing.filter((e) => e.idNumber).map((e) => [normId(e.idNumber!), e.residentCode]));
  const existingByEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e.residentCode]));
  const existingByPhoneName = new Map(existing.map((e) => [`${normPhone(e.phone)}|${normName(e.firstName, e.lastName)}`, e.residentCode]));

  const seenId = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const seenPhoneName = new Map<string, number>();
  const usedBeds = new Map<string, number>();
  const roomLoad = new Map<string, number>();

  return rows.map(({ rowNumber, data }): ResolvedRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let duplicateOf: string | null = null;

    const hostel = findHostel(data.hostel);
    if (!data.hostel) errors.push("Hostel is required.");
    else if (!hostel) errors.push(`Hostel "${data.hostel}" wasn't found (use its code or exact name).`);

    const status: ResidentStatus = data.status ? (STATUS_ALIASES[key(data.status)] ?? ("INVALID" as ResidentStatus)) : "ACTIVE";
    if ((status as string) === "INVALID") errors.push(`Unknown status "${data.status}". Use Active, On notice, Suspended or Checked out.`);

    const gender = data.gender ? GENDER_ALIASES[key(data.gender)] : undefined;
    if (data.gender && !gender) errors.push(`Unknown gender "${data.gender}". Use Male, Female or Other.`);

    const dates: Partial<Record<ImportColumnKey, string>> = {};
    const badDates = new Set<string>();
    for (const col of ["joiningDate", "dateOfBirth", "expectedLeavingDate", "checkInDate", "leavingDate"] as const) {
      const parsed = parseImportDate(data[col]);
      if (parsed === null) badDates.add(col);
      if (parsed === null) errors.push(`${IMPORT_COLUMNS.find((c) => c.key === col)!.header} "${data[col]}" isn't a valid date.`);
      else if (parsed) dates[col] = parsed;
    }
    if (!data.joiningDate) errors.push("Joining date is required.");

    const rent = parseMoney(data.monthlyRent);
    const deposit = parseMoney(data.securityDeposit);
    if (rent === null) errors.push(`Monthly rent "${data.monthlyRent}" isn't a valid amount.`);
    if (deposit === null) errors.push(`Security deposit "${data.securityDeposit}" isn't a valid amount.`);

    // Profile validation: exactly the schema used by the resident form.
    let input: ResidentInput | undefined;
    const candidate: ResidentInput = {
      hostelId: hostel?.id ?? "",
      firstName: data.firstName ?? "",
      lastName: data.lastName ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      alternatePhone: data.alternatePhone ?? "",
      gender: gender ?? "",
      dateOfBirth: dates.dateOfBirth ?? "",
      idNumber: data.idNumber ?? "",
      nationality: data.nationality ?? "",
      address: data.address ?? "",
      city: data.city ?? "",
      occupation: data.occupation ?? "",
      institution: data.institution ?? "",
      joiningDate: dates.joiningDate ?? "",
      expectedLeavingDate: dates.expectedLeavingDate ?? "",
      emergencyContactName: data.emergencyContactName ?? "",
      emergencyContactPhone: data.emergencyContactPhone ?? "",
      emergencyContactRelation: data.emergencyContactRelation ?? "",
      guardianName: data.guardianName ?? "",
      guardianPhone: data.guardianPhone ?? "",
      status: status === "CHECKED_OUT" || (status as string) === "INVALID" ? "ACTIVE" : (status as "ACTIVE" | "NOTICE" | "SUSPENDED"),
      notes: data.notes ?? "",
    } as ResidentInput;
    const parsed = residentSchema.safeParse(candidate);
    if (parsed.success) input = candidate;
    else {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        const header = IMPORT_COLUMNS.find((c) => c.key === field)?.header;
        // Skip errors already reported above in friendlier wording.
        if (field === "hostelId" || badDates.has(field) || (field === "joiningDate" && !data.joiningDate)) continue;
        errors.push(header ? `${header}: ${issue.message}` : issue.message);
      }
    }
    if (dates.joiningDate && dates.joiningDate > today) warnings.push("Joining date is in the future.");

    // Placement.
    let bedId: string | undefined;
    let placement: string | null = null;
    let monthlyRent: number | undefined;
    const checkInDate = dates.checkInDate ?? dates.joiningDate;
    if (data.room || data.bed) {
      if (status === "CHECKED_OUT") errors.push("Checked-out residents can't be placed in a bed — leave Room and Bed empty.");
      else if (!data.room || !data.bed) errors.push("Give both Room and Bed, or leave both empty.");
      else if (!canAssign) errors.push("Your role can't assign beds. Leave Room and Bed empty or ask an admin.");
      else if (hostel) {
        const room = roomByKey.get(`${hostel.id}|${data.room.trim().toLowerCase()}`);
        const bed = room?.beds.find((b) => b.bedNumber.trim().toLowerCase() === data.bed!.trim().toLowerCase());
        if (!room) errors.push(`Room "${data.room}" doesn't exist in ${hostel.name}.`);
        else if (!bed) errors.push(`Room ${room.roomNumber} has no bed "${data.bed}".`);
        else if (room.status === "MAINTENANCE" || room.status === "INACTIVE") errors.push(`Room ${room.roomNumber} is ${room.status.toLowerCase()}.`);
        else if (bed.status !== "AVAILABLE") errors.push(`Room ${room.roomNumber} · Bed ${bed.bedNumber} is ${bed.status.toLowerCase()}.`);
        else if (usedBeds.has(bed.id)) errors.push(`Room ${room.roomNumber} · Bed ${bed.bedNumber} is already used by row ${usedBeds.get(bed.id)}.`);
        else if (room._count.assignments + (roomLoad.get(room.id) ?? 0) >= room.capacity) errors.push(`Room ${room.roomNumber} is at its capacity of ${room.capacity}.`);
        else {
          bedId = bed.id;
          placement = `${hostel.code} · Room ${room.roomNumber} · Bed ${bed.bedNumber}`;
          const defaultRent = toNumber(bed.monthlyRent ?? room.rent ?? hostel.defaultBedRent);
          monthlyRent = rent ?? (defaultRent || undefined);
          if (monthlyRent === undefined) errors.push("Monthly rent is required (no default rent is set for this bed, room or hostel).");
          if (checkInDate && checkInDate > today) errors.push("Check-in date can't be in the future.");
        }
      }
    }
    if (!placement && hostel) placement = status === "CHECKED_OUT" ? `${hostel.code} · former resident` : `${hostel.code} · no bed`;

    // Duplicates: within the file, then against existing residents.
    const idKey = normId(data.idNumber);
    const emailKey = data.email?.trim().toLowerCase();
    const phoneNameKey = `${normPhone(data.phone)}|${normName(data.firstName, data.lastName)}`;
    const fileDup = (idKey && seenId.get(idKey)) || (emailKey && seenEmail.get(emailKey)) || (normPhone(data.phone) && seenPhoneName.get(phoneNameKey));
    const dbDup = (idKey && existingById.get(idKey)) || (emailKey && existingByEmail.get(emailKey)) || (normPhone(data.phone) && existingByPhoneName.get(phoneNameKey));
    if (fileDup) duplicateOf = `Same person as row ${fileDup} in this file.`;
    else if (dbDup) duplicateOf = `Already exists as ${dbDup}.`;

    const ready = errors.length === 0 && !duplicateOf;
    if (!duplicateOf) {
      if (idKey) seenId.set(idKey, rowNumber);
      if (emailKey) seenEmail.set(emailKey, rowNumber);
      if (normPhone(data.phone)) seenPhoneName.set(phoneNameKey, rowNumber);
    }
    if (ready && bedId) {
      usedBeds.set(bedId, rowNumber);
      const roomId = rooms.find((r) => r.beds.some((b) => b.id === bedId))!.id;
      roomLoad.set(roomId, (roomLoad.get(roomId) ?? 0) + 1);
    }

    return {
      rowNumber,
      status: duplicateOf ? "duplicate" : errors.length ? "invalid" : "ready",
      errors: duplicateOf ? [duplicateOf, ...errors] : errors,
      warnings,
      data,
      placement,
      input,
      bedId,
      checkInDate,
      monthlyRent,
      securityDeposit: deposit ?? (bedId ? toNumber(hostel?.defaultDeposit) : undefined) ?? undefined,
      leavingDate: dates.leavingDate,
      finalStatus: status,
    };
  });
}

function assertCanImport(ctx: TenantContext) {
  requirePermission(ctx, "residents.manage");
}

/** Validate a file and return a row-by-row preview. Nothing is written. */
export async function previewResidentImport(ctx: TenantContext, bytes: Uint8Array, fileName: string) {
  assertCanImport(ctx);
  const { rows, unknownHeaders } = await parseImportFile(bytes, fileName);
  const resolved = await resolveRows(ctx, rows);
  const preview: PreviewRow[] = resolved.map(({ rowNumber, status, errors, warnings, data, placement }) => ({ rowNumber, status, errors, warnings, data, placement }));
  return {
    fileName,
    rows: preview,
    unknownHeaders,
    counts: {
      total: preview.length,
      ready: preview.filter((r) => r.status === "ready").length,
      duplicate: preview.filter((r) => r.status === "duplicate").length,
      invalid: preview.filter((r) => r.status === "invalid").length,
    },
  };
}

/**
 * Import a batch of rows. Everything is re-validated against the current
 * database (never trusting the preview), so re-sending a batch reports the
 * already-imported rows as duplicates instead of creating them twice.
 */
export async function importResidentBatch(ctx: TenantContext, rows: { rowNumber: number; data: RawImportRow }[]): Promise<ImportRowResult[]> {
  assertCanImport(ctx);
  if (rows.length > 200) throw new ValidationError("Send at most 200 rows per request.");
  const resolved = await resolveRows(ctx, rows);
  const results: ImportRowResult[] = [];

  for (const row of resolved) {
    if (row.status === "duplicate") {
      results.push({ rowNumber: row.rowNumber, outcome: "duplicate", message: row.errors[0] ?? "Duplicate" });
      continue;
    }
    if (row.status === "invalid" || !row.input) {
      results.push({ rowNumber: row.rowNumber, outcome: "skipped", message: row.errors.join(" ") || "Invalid row" });
      continue;
    }
    let residentId: string | undefined;
    try {
      const resident = await createResident(ctx, row.input);
      residentId = resident.id;
      if (row.bedId) {
        await checkIn(ctx, {
          residentId: resident.id,
          bedId: row.bedId,
          checkInDate: row.checkInDate ?? row.input.joiningDate,
          monthlyRent: row.monthlyRent ?? 0,
          securityDeposit: row.securityDeposit ?? 0,
          notes: "Imported from file",
        });
      } else if (row.finalStatus === "CHECKED_OUT") {
        await prisma.resident.update({
          where: { id: resident.id },
          data: { status: "CHECKED_OUT", actualLeavingDate: row.leavingDate ? new Date(`${row.leavingDate}T00:00:00Z`) : null },
        });
      }
      results.push({ rowNumber: row.rowNumber, outcome: "imported", message: row.placement ?? "Imported", residentId: resident.id, residentCode: resident.residentCode });
    } catch (error) {
      // Keep each row atomic: a resident whose bed assignment failed is removed again.
      if (residentId) {
        await prisma.resident.delete({ where: { id: residentId } }).catch(() => undefined);
      }
      const message = isAppError(error) && error.code !== "INTERNAL_ERROR" ? error.message : "Unexpected error while saving this row.";
      if (!isAppError(error)) console.error("[import] row failed", row.rowNumber, error);
      results.push({ rowNumber: row.rowNumber, outcome: "failed", message });
    }
  }

  const tally = (o: ImportRowResult["outcome"]) => results.filter((r) => r.outcome === o).length;
  await audit(actorOf(ctx), {
    action: "resident.bulk_imported",
    entityType: "Resident",
    metadata: { imported: tally("imported"), duplicate: tally("duplicate"), skipped: tally("skipped"), failed: tally("failed"), rows: rows.length },
  });
  return results;
}

/** Template workbook/CSV rows: header + one example row. */
export function importTemplate() {
  return {
    headers: IMPORT_COLUMNS.map((c) => c.header),
    example: IMPORT_COLUMNS.map((c) => c.example),
    notes: IMPORT_COLUMNS.map((c) => `${c.header}${c.required ? " (required)" : ""}${"hint" in c ? ` — ${c.hint}` : ""}`),
  };
}
