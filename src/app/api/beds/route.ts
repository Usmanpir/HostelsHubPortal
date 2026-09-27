import { readJson, tenantRoute } from "@/lib/api/handler";
import { createBed, listAvailableBeds, listBeds } from "@/services/hostel/structure-service";
import type { BedInput } from "@/lib/validation/property";
import type { BedStatus } from "@/generated/prisma/enums";

/** GET /api/beds?hostelId=&roomId=&status=&q=&page=  (…&available=1 for check-in pickers) */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const p = req.nextUrl.searchParams;
  const hostelId = p.get("hostelId");
  if (p.get("available") === "1" && hostelId) return listAvailableBeds(ctx, hostelId);
  return listBeds(ctx, {
    hostelId,
    roomId: p.get("roomId") ?? undefined,
    status: (p.get("status") as BedStatus | null) ?? undefined,
    q: p.get("q") ?? undefined,
    page: Number(p.get("page") ?? 1),
    pageSize: Number(p.get("pageSize") ?? 20),
  });
});

export const POST = tenantRoute(async ({ req, ctx }) => createBed(ctx, (await readJson(req)) as BedInput));
