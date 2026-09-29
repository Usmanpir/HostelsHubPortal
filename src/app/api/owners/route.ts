import { readJson, tenantRoute } from "@/lib/api/handler";
import type { OwnerInput } from "@/lib/validation/owners";
import { createOwner, listOwners } from "@/services/owners/owner-service";
import { parseOwnerFilters } from "@/services/owners/filters";

/** GET /api/owners?q=&status=ACTIVE|ARCHIVED|ALL&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listOwners(ctx, parseOwnerFilters(req.nextUrl.searchParams)));

/** POST /api/owners — body: OwnerInput */
export const POST = tenantRoute(async ({ req, ctx }) => createOwner(ctx, (await readJson(req)) as OwnerInput));
