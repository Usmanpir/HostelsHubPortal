import { readJson, tenantRoute } from "@/lib/api/handler";
import type { ListingStatusInput } from "@/lib/validation/real-estate";
import { changeListingStatus } from "@/services/real-estate/listing-service";

/** POST /api/listings/:id/status { status } */
export const POST = tenantRoute<{ id: string }>(async ({ req, params, ctx }) =>
  changeListingStatus(ctx, params.id, (await readJson(req)) as ListingStatusInput),
);
