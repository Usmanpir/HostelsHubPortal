import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { createStaff, listStaff } from "@/services/staff/staff-service";
import { staffFiltersFromParams } from "@/services/staff/params";
import type { StaffInput } from "@/lib/validation/staff";

/** GET /api/staff?q=&designation=&status=&employmentType=&hostelId=&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listStaff(ctx, staffFiltersFromParams(searchParamsObject(req))));

/** POST /api/staff */
export const POST = tenantRoute(async ({ req, ctx }) => createStaff(ctx, (await readJson(req)) as StaffInput));
