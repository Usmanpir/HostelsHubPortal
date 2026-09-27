import { tenantRoute } from "@/lib/api/handler";
import { listStaffForAssignment } from "@/services/staff/staff-service";

/** GET /api/staff/options?hostelId= → [{ id, name, designation }] for assignment pickers. */
export const GET = tenantRoute(async ({ req, ctx }) =>
  listStaffForAssignment(ctx, req.nextUrl.searchParams.get("hostelId") || null),
);
