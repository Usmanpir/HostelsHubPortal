import { readJson, tenantRoute } from "@/lib/api/handler";
import type { ListingInput } from "@/lib/validation/real-estate";
import { archiveListing, getListing, updateListing } from "@/services/real-estate/listing-service";

type Params = { id: string };

export const GET = tenantRoute<Params>(async ({ params, ctx }) => getListing(ctx, params.id));

export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => updateListing(ctx, params.id, (await readJson(req)) as ListingInput));

/** DELETE archives the listing (history is kept). */
export const DELETE = tenantRoute<Params>(async ({ params, ctx }) => {
  await archiveListing(ctx, params.id);
  return null;
});
