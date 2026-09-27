import { tenantRoute } from "@/lib/api/handler";
import { todayInTimeZone } from "@/lib/format";
import { getFinanceSummary } from "@/services/finance/finance-dashboard-service";
import { resolveRange } from "@/services/finance/range";

/** GET /api/finance/summary?range=today|week|month|last_month|year|custom&from=&to=&hostel= */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const p = req.nextUrl.searchParams;
  const range = resolveRange(todayInTimeZone(ctx.organization.timezone), p.get("range"), p.get("from"), p.get("to"));
  const summary = await getFinanceSummary(ctx, { from: range.from, to: range.to, hostelId: p.get("hostel") });
  return { ...summary, preset: range.preset, label: range.label };
});
