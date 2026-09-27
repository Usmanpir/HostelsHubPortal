import { searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { exportAuditLogs, listAuditLogs } from "@/services/reports/audit-log-service";

const EXPORT_RATE = { limit: 30, windowSeconds: 10 * 60 };

/**
 * GET /api/audit-logs?q=&action=payment.&userId=&from=&to=&page=&pageSize=
 * Organization-scoped audit trail; ?format=csv|xlsx downloads the filtered log.
 */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const query = searchParamsObject(req);
  const format = query.format;
  if (format === "csv" || format === "xlsx") {
    await enforceRateLimit(`export:${ctx.userId}`, EXPORT_RATE);
    return exportAuditLogs(ctx, query, format);
  }
  return listAuditLogs(ctx, query);
});
