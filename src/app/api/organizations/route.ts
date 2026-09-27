import { readJson, tenantRoute } from "@/lib/api/handler";
import { getOrganizationSettings, updateOrganizationProfile } from "@/services/organization/settings-service";
import type { OrganizationSettingsInput } from "@/lib/validation/settings";

/** GET /api/organizations — current organization profile, branding, invoice and notification settings. */
export const GET = tenantRoute(async ({ ctx }) => getOrganizationSettings(ctx));

/** PATCH /api/organizations — update the organization profile. */
export const PATCH = tenantRoute(async ({ req, ctx }) => {
  await updateOrganizationProfile(ctx, (await readJson(req)) as OrganizationSettingsInput);
  return getOrganizationSettings(ctx);
});
