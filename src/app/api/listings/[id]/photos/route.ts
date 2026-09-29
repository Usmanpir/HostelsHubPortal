import { readJson, tenantRoute } from "@/lib/api/handler";
import type { ListingCoverInput, ListingPhotosInput } from "@/lib/validation/real-estate";
import { addListingPhotos, setListingCover } from "@/services/real-estate/listing-service";

type Params = { id: string };

/** POST /api/listings/:id/photos { photoFileIds } — attach uploads made with purpose "listing-photo". */
export const POST = tenantRoute<Params>(async ({ req, params, ctx }) => addListingPhotos(ctx, params.id, (await readJson(req)) as ListingPhotosInput));

/** PATCH /api/listings/:id/photos { fileId } — choose the cover photo. */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => {
  await setListingCover(ctx, params.id, (await readJson(req)) as ListingCoverInput);
  return null;
});
