import { readJson, tenantRoute } from "@/lib/api/handler";
import type { OwnerInput } from "@/lib/validation/owners";
import { archiveOwner, getOwner, updateOwner } from "@/services/owners/owner-service";

type Params = { id: string };

/** GET /api/owners/:id — profile, linked properties, stats and recent payouts */
export const GET = tenantRoute<Params>(async ({ params, ctx }) => getOwner(ctx, params.id));

/** PATCH /api/owners/:id — body: OwnerInput (full profile) */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => updateOwner(ctx, params.id, (await readJson(req)) as OwnerInput));

/**
 * DELETE /api/owners/:id — archives (never deletes). Owners with linked
 * properties are refused unless `?unlink=true`, which unlinks them first.
 */
export const DELETE = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const unlink = ["1", "true"].includes(req.nextUrl.searchParams.get("unlink") ?? "");
  await archiveOwner(ctx, params.id, { unlink });
  return { id: params.id, archived: true };
});
