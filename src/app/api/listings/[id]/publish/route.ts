import { readJson, tenantRoute } from "@/lib/api/handler";
import type { ListingPublishInput } from "@/lib/validation/real-estate";
import { setListingPublished } from "@/services/real-estate/listing-service";

/** POST /api/listings/:id/publish { published: boolean } */
export const POST = tenantRoute<{ id: string }>(async ({ req, params, ctx }) =>
  setListingPublished(ctx, params.id, (await readJson(req)) as ListingPublishInput),
);
