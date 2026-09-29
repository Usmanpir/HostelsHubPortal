import { readJson, tenantRoute } from "@/lib/api/handler";
import type { OwnerPropertiesInput } from "@/lib/validation/owners";
import { listLinkableProperties, setOwnerProperties } from "@/services/owners/owner-service";

type Params = { id: string };

/** GET /api/owners/:id/properties — active properties the member can link, with their current owner */
export const GET = tenantRoute<Params>(async ({ params, ctx }) => listLinkableProperties(ctx, params.id));

/** PUT /api/owners/:id/properties — body: { hostelIds: string[] } (the complete set to link) */
export const PUT = tenantRoute<Params>(async ({ req, params, ctx }) =>
  setOwnerProperties(ctx, params.id, (await readJson(req)) as OwnerPropertiesInput),
);
