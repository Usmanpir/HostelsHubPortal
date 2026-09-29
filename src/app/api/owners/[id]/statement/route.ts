import { tenantRoute } from "@/lib/api/handler";
import { getOwnerStatement } from "@/services/owners/statement";

type Params = { id: string };

/** GET /api/owners/:id/statement?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to the last full month) */
export const GET = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const sp = req.nextUrl.searchParams;
  return getOwnerStatement(ctx, params.id, { from: sp.get("from"), to: sp.get("to") });
});
