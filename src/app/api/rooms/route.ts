import { readJson, tenantRoute } from "@/lib/api/handler";
import { createRoom, listRooms } from "@/services/hostel/structure-service";
import type { RoomInput } from "@/lib/validation/property";
import type { RoomStatus, RoomType } from "@/generated/prisma/enums";

/** GET /api/rooms?hostelId=&floorId=&status=&roomType=&q=&page= */
export const GET = tenantRoute(async ({ req, ctx }) => {
  const p = req.nextUrl.searchParams;
  return listRooms(ctx, {
    hostelId: p.get("hostelId"),
    floorId: p.get("floorId") ?? undefined,
    status: (p.get("status") as RoomStatus | null) ?? undefined,
    roomType: (p.get("roomType") as RoomType | null) ?? undefined,
    q: p.get("q") ?? undefined,
    page: Number(p.get("page") ?? 1),
    pageSize: Number(p.get("pageSize") ?? 20),
  });
});

export const POST = tenantRoute(async ({ req, ctx }) => createRoom(ctx, (await readJson(req)) as RoomInput));
