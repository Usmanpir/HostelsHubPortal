import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { exportReport, runReport } from "@/services/reports/report-service";

/** Exports are heavier than page loads; cap them per user. */
const EXPORT_RATE = { limit: 30, windowSeconds: 10 * 60 };

/**
 * GET /api/reports/:report?range=|from=&to=&hostelId=&status=&page=&pageSize=
 * Returns JSON, or a file download with ?format=csv|xlsx (capped at EXPORT_ROW_LIMIT rows).
 */
export const GET = tenantRoute<{ report: string }>(async ({ req, params, ctx }) => {
  const query = searchParamsObject(req);
  const format = query.format;
  if (format === "csv" || format === "xlsx") {
    await enforceRateLimit(`export:${ctx.userId}`, EXPORT_RATE);
    return exportReport(ctx, params.report, query, format);
  }
  return runReport(ctx, params.report, query);
});
