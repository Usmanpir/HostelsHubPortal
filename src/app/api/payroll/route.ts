import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { generatePayroll, listPayroll } from "@/services/staff/payroll-service";
import { payrollStatusFromParams, periodFromParams } from "@/services/staff/params";
import type { PayrollGenerateInput } from "@/lib/validation/staff";

/** GET /api/payroll?year=&month= (or ?month=YYYY-MM)&status=&q=&hostelId=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const params = searchParamsObject(req);
  const p = req.nextUrl.searchParams;
  return listPayroll(ctx, {
    ...periodFromParams(ctx, params),
    status: payrollStatusFromParams(params),
    q: p.get("q") ?? undefined,
    hostelId: p.get("hostelId") || null,
    page: Number(p.get("page") ?? 1),
    pageSize: Number(p.get("pageSize") ?? 20),
  });
});

/** POST /api/payroll { year, month, hostelId? } — generates missing salary records for the month. */
export const POST = tenantRoute(async ({ req, ctx }) => generatePayroll(ctx, (await readJson(req)) as PayrollGenerateInput));
