import { readJson, tenantRoute } from "@/lib/api/handler";
import { updateBranding } from "@/services/organization/settings-service";
import type { BrandingInput } from "@/lib/validation/settings";

/** PATCH /api/organizations/branding — white-label settings (plan feature "branding.custom"). */
export const PATCH = tenantRoute(async ({ req, ctx }) => updateBranding(ctx, (await readJson(req)) as BrandingInput));
