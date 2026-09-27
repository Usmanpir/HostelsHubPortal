import { readJson, tenantRoute } from "@/lib/api/handler";
import { createHostel, listHostels } from "@/services/hostel/hostel-service";
import type { HostelInput } from "@/lib/validation/property";

/** GET /api/hostels?q=&status=&page=&pageSize= */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const p = req.nextUrl.searchParams;
  return listHostels(ctx, {
    q: p.get("q") ?? undefined,
    status: (p.get("status") as "ACTIVE" | "INACTIVE" | "ARCHIVED" | "ALL" | null) ?? undefined,
    page: Number(p.get("page") ?? 1),
    pageSize: Number(p.get("pageSize") ?? 20),
  });
});

/** POST /api/hostels */
export const POST = tenantRoute(async ({ req, ctx }) => createHostel(ctx, (await readJson(req)) as HostelInput));
