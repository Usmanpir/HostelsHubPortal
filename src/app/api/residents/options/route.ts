import { tenantRoute } from "@/lib/api/handler";
import { listResidentOptions } from "@/services/resident/resident-service";

/**
 * GET /api/residents/options?q=&id=&hostelId=&active=1 — resident picker for invoices,
 * payments, visitors, complaints and maintenance. `active=1` hides checked-out residents.
 */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const p = req.nextUrl.searchParams;
  return listResidentOptions(ctx, p.get("q") ?? undefined, {
    residentId: p.get("id") ?? undefined,
    hostelId: p.get("hostelId") || null,
    includeCheckedOut: p.get("active") === "1" ? false : undefined,
  });
});
