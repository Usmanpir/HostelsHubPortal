import "server-only";
import ExcelJS from "exceljs";

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | Date | null | undefined;
  width?: number;
};

export type ExportFormat = "csv" | "xlsx";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvEscape(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvEscape(c.value(row))).join(","));
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx<T>(sheetName: string, columns: ExportColumn<T>[], rows: T[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rows) {
    sheet.addRow(
      columns.map((c) => {
        const v = c.value(row);
        if (typeof v === "string" && /^[=+\-@]/.test(v)) return `'${v}`;
        return v ?? "";
      }),
    );
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function exportResponse<T>(
  format: ExportFormat,
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
): Promise<Response> {
  const safe = filename.replace(/[^\w.-]+/g, "-");
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const bytes = await toXlsx(filename, columns, rows);
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safe}-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(toCsv(columns, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Hard cap so an export can never pull an unbounded table into memory. */
export const EXPORT_ROW_LIMIT = 10_000;
