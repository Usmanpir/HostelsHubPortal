import { readJson, tenantRoute } from "@/lib/api/handler";
import { archiveFloor, updateFloor } from "@/services/hostel/structure-service";
import type { FloorInput } from "@/lib/validation/property";

type Params = { id: string };

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateFloor(ctx, params.id, (await readJson(req)) as FloorInput),
);

export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await archiveFloor(ctx, params.id);
  return null;
});
