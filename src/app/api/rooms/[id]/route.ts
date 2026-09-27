import { readJson, tenantRoute } from "@/lib/api/handler";
import { archiveRoom, getRoom, updateRoom } from "@/services/hostel/structure-service";
import type { RoomInput } from "@/lib/validation/property";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getRoom(ctx, params.id));

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateRoom(ctx, params.id, (await readJson(req)) as RoomInput),
);

export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await archiveRoom(ctx, params.id);
  return null;
});
