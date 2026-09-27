import { readJson } from "@/lib/api/handler";
import type { PortalProfileInput } from "@/lib/validation/portal";
import { getPortalProfile, updatePortalProfile } from "@/services/portal/profile-service";
import { residentRoute } from "../_lib/handler";

/** GET /api/portal/me — the signed-in resident's own profile. */
export const GET = residentRoute(async ({ ctx }) => getPortalProfile(ctx));

/** PATCH /api/portal/me — update phone, alternate phone and emergency contact only. */
export const PATCH = residentRoute(async ({ req, ctx }) => {
  await updatePortalProfile(ctx, (await readJson(req)) as PortalProfileInput);
  return getPortalProfile(ctx);
});
