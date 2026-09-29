import { readJson, searchParamsObject, tenantRoute } from "@/lib/api/handler";
import type { ListingFilters, ListingInput } from "@/lib/validation/real-estate";
import { createListing, listListings } from "@/services/real-estate/listing-service";

/** GET /api/listings?q=&purpose=&status=&propertyType=&city=&minPrice=&maxPrice=&sort=&dir=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => listListings(ctx, searchParamsObject(req) as ListingFilters));

/** POST /api/listings — creates a DRAFT listing. */
export const POST = tenantRoute(async ({ req, ctx }) => createListing(ctx, (await readJson(req)) as ListingInput));
