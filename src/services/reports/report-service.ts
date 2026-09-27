import "server-only";
import { audit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { EXPORT_ROW_LIMIT, exportResponse, type ExportColumn, type ExportFormat } from "@/lib/export";
import { formatDateTime } from "@/lib/format";
import { actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import type { ReportImpl } from "./definition";
import { getReportMeta, reportPermissions, type ReportKey, type ReportMeta } from "./registry";
import { parseReportFilters, toPaging } from "./shared";
import type { ReportColumn, ReportResult, ReportRow } from "./types";
import { occupancyReport } from "./occupancy";
import { vacancyReport } from "./vacancy";
import { residentsReport } from "./residents";
import { checkInsReport } from "./check-ins";
import { checkOutsReport } from "./check-outs";
import { rentCollectionReport } from "./rent-collection";
import { outstandingReport } from "./outstanding";
import { revenueReport } from "./revenue";
import { expensesReport } from "./expenses";
import { profitLossReport } from "./profit-loss";
import { staffAttendanceReport } from "./staff-attendance";
import { staffPayrollReport } from "./staff-payroll";
import { maintenanceReport } from "./maintenance";
import { complaintsReport } from "./complaints";
import { visitorsReport } from "./visitors";

const IMPLEMENTATIONS: Record<ReportKey, ReportImpl> = {
  occupancy: occupancyReport,
  vacancy: vacancyReport,
  residents: residentsReport,
  "check-ins": checkInsReport,
  "check-outs": checkOutsReport,
  "rent-collection": rentCollectionReport,
  outstanding: outstandingReport,
  revenue: revenueReport,
  expenses: expensesReport,
  "profit-loss": profitLossReport,
  "staff-attendance": staffAttendanceReport,
  "staff-payroll": staffPayrollReport,
  maintenance: maintenanceReport,
  complaints: complaintsReport,
  visitors: visitorsReport,
};

type Params = Record<string, string | string[] | undefined>;

function resolve(ctx: TenantContext, key: string): { meta: ReportMeta; impl: ReportImpl } {
  const meta = getReportMeta(key);
  if (!meta) throw new NotFoundError("Report");
  requirePermission(ctx, ...reportPermissions(meta));
  return { meta, impl: IMPLEMENTATIONS[meta.key as ReportKey] };
}

/** Full report for the page / JSON API: summary + one page of rows. */
export async function runReport(ctx: TenantContext, key: string, params: Params): Promise<ReportResult> {
  const { meta, impl } = resolve(ctx, key);
  const { filters, page, pageSize } = parseReportFilters(ctx, meta, params);
  const [summary, rows] = await Promise.all([impl.summary(ctx, filters), impl.rows(ctx, filters, toPaging(page, pageSize))]);
  return {
    ...summary,
    table: { ...rows, page, pageSize, pageCount: Math.max(1, Math.ceil(rows.total / pageSize)) },
    filters: { from: filters.from, to: filters.to, preset: filters.preset, hostelId: filters.hostelId, status: filters.status },
  };
}

function exportHeader(c: ReportColumn, currency: string) {
  switch (c.format) {
    case "money":
      return `${c.header} (${currency})`;
    case "percent":
      return `${c.header} (%)`;
    case "hours":
      return `${c.header} (hours)`;
    case "days":
      return `${c.header} (days)`;
    default:
      return c.header;
  }
}

function exportValue(c: ReportColumn, row: ReportRow, timezone: string): string | number | null {
  const v = row[c.key] ?? null;
  if (v === null) return null;
  switch (c.format) {
    case "badge":
      return c.labels?.[String(v)] ?? String(v);
    case "date":
      return String(v).slice(0, 10);
    case "datetime":
      return formatDateTime(String(v), timezone);
    case "money":
    case "number":
    case "percent":
    case "hours":
    case "days":
      return typeof v === "number" ? v : Number(v);
    default: {
      const sub = c.subKey ? row[c.subKey] : null;
      return sub ? `${v} (${sub})` : v;
    }
  }
}

/** CSV/XLSX download of the report's detail table (capped at EXPORT_ROW_LIMIT). */
export async function exportReport(ctx: TenantContext, key: string, params: Params, format: ExportFormat): Promise<Response> {
  const { meta, impl } = resolve(ctx, key);
  const { filters } = parseReportFilters(ctx, meta, params);
  const data = await impl.rows(ctx, filters, { skip: 0, take: EXPORT_ROW_LIMIT });
  const timezone = ctx.organization.timezone;
  const columns: ExportColumn<ReportRow>[] = data.columns.map((c) => ({
    header: exportHeader(c, ctx.organization.currency),
    value: (row) => exportValue(c, row, timezone),
    width: c.format === "datetime" ? 22 : c.format === "text" || !c.format ? 24 : 14,
  }));
  await audit(actorOf(ctx), {
    action: "report.exported",
    entityType: "Report",
    entityId: meta.key,
    metadata: { format, from: filters.from, to: filters.to, hostelId: filters.hostelId, status: filters.status, rows: data.rows.length },
  });
  const suffix = meta.usesDateRange ? `${filters.from}_to_${filters.to}` : `as-of-${filters.today}`;
  return exportResponse(format, `${meta.key}-report_${suffix}`, columns, data.rows);
}
