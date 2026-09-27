import { readJson, tenantRoute } from "@/lib/api/handler";
import { archiveHostel, getHostel, updateHostel } from "@/services/hostel/hostel-service";
import type { HostelInput } from "@/lib/validation/property";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getHostel(ctx, params.id));

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) =>
  updateHostel(ctx, params.id, (await readJson(req)) as HostelInput),
);

/** DELETE archives (soft delete) — hostels with history are never hard-deleted. */
export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await archiveHostel(ctx, params.id);
  return null;
});
