import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { createLeave, listLeaves } from "@/services/staff/leave-service";
import { leaveFiltersFromParams } from "@/services/staff/params";
import type { LeaveInput } from "@/lib/validation/staff";

/** GET /api/leave?status=&type=&staffId=&q=&hostelId=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listLeaves(ctx, leaveFiltersFromParams(searchParamsObject(req))));

/** POST /api/leave { staffId, type, startDate, endDate, reason? } */
export const POST = tenantRoute(async ({ req, ctx }) => createLeave(ctx, (await readJson(req)) as LeaveInput));
