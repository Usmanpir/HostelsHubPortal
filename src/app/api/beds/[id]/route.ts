import { readJson, tenantRoute } from "@/lib/api/handler";
import { archiveBed, updateBed } from "@/services/hostel/structure-service";
import type { BedUpdateInput } from "@/lib/validation/property";

type Params = { id: string };

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateBed(ctx, params.id, (await readJson(req)) as BedUpdateInput),
);

export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await archiveBed(ctx, params.id);
  return null;
});
