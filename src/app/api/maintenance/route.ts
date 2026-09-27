import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { createMaintenance, listMaintenance } from "@/services/operations/maintenance-service";
import type { MaintenanceFilters, MaintenanceInput } from "@/lib/validation/operations";

/** GET /api/maintenance?q=&status=&priority=&category=&hostelId=&state=open|closed&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listMaintenance(ctx, searchParamsObject(req) as MaintenanceFilters));

/** POST /api/maintenance — { hostelId, category, title, … } */
export const POST = tenantRoute(async ({ req, ctx }) => createMaintenance(ctx, (await readJson(req)) as MaintenanceInput));
