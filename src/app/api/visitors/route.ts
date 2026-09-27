import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import { checkInVisitor, listVisitors, listVisitorsInside } from "@/services/operations/visitor-service";
import type { VisitorCheckInInput, VisitorFilters } from "@/lib/validation/operations";

/**
 * GET /api/visitors?q=&hostelId=&from=YYYY-MM-DD&to=YYYY-MM-DD&state=inside|left&page=&pageSize=
 * GET /api/visitors?inside=1 → everyone currently checked in (not paginated)
 */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const { inside, ...params } = searchParamsObject(req);
  if (inside === "1") return listVisitorsInside(ctx, params.hostelId ?? null);
  return listVisitors(ctx, params as VisitorFilters);
});

/** POST /api/visitors — check a visitor in. */
export const POST = tenantRoute(async ({ req, ctx }) => checkInVisitor(ctx, (await readJson(req)) as VisitorCheckInInput));
