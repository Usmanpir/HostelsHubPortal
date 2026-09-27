import { readJson, tenantRoute } from "@/lib/api/handler";
import { archiveResident, getResident, updateResident } from "@/services/resident/resident-service";
import type { ResidentInput } from "@/lib/validation/resident";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getResident(ctx, params.id));

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateResident(ctx, params.id, (await readJson(req)) as ResidentInput),
);

/** DELETE archives (soft delete) — residents with history are never hard-deleted. */
export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await archiveResident(ctx, params.id);
  return null;
});
