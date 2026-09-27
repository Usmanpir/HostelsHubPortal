import { readJson, tenantRoute } from "@/lib/api/handler";
import { createFloor, listFloors } from "@/services/hostel/structure-service";
import type { FloorInput } from "@/lib/validation/property";

export const GET = tenantRoute(async ({ req, ctx }) => listFloors(ctx, req.nextUrl.searchParams.get("hostelId")));

export const POST = tenantRoute(async ({ req, ctx }) => createFloor(ctx, (await readJson(req)) as FloorInput));
