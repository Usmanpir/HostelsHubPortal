import { tenantRoute } from "@/lib/api/handler";
import { globalSearch } from "@/services/search/search-service";

/** GET /api/search?q=… → categorized results the member is allowed to see */
export const GET = tenantRoute(async ({ req, ctx }) => {
  return globalSearch(ctx, req.nextUrl.searchParams.get("q") ?? "");
});
