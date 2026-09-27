import "server-only";
import type { TenantContext } from "@/lib/tenant/context";
import type { Paging, ReportFilters } from "./shared";
import type { ReportRows, ReportSummary } from "./types";

/**
 * Data logic for one report. `summary` produces stats/charts/breakdowns;
 * `rows` produces the detail table (paged for the page, up to the export
 * limit for CSV/XLSX). Permission checks happen in ./index.ts before either
 * is called, and every query inside must be tenant + hostel scoped.
 */
export type ReportImpl = {
  summary(ctx: TenantContext, f: ReportFilters): Promise<ReportSummary>;
  rows(ctx: TenantContext, f: ReportFilters, paging: Paging): Promise<ReportRows>;
};
