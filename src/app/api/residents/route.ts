import { readJson, tenantRoute } from "@/lib/api/handler";
import { createResident, listResidents } from "@/services/resident/resident-service";
import { parseResidentFilters } from "@/services/resident/filters";
import type { ResidentInput } from "@/lib/validation/resident";

/** GET /api/residents?q=&status=&hostelId=&assigned=&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listResidents(ctx, parseResidentFilters(req.nextUrl.searchParams)));

/** POST /api/residents */
export const POST = tenantRoute(async ({ req, ctx }) => createResident(ctx, (await readJson(req)) as ResidentInput));
