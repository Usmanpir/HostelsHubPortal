import { readJson } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import type { FlagOverrideInput } from "@/lib/validation/admin";
import { removeFlagOverride, setFlagOverride } from "@/services/admin/feature-flags";
import { adminRoute } from "../../../_lib/handler";

type Params = { key: string };

/** PUT /api/admin/feature-flags/:key/overrides { organizationId, enabled } — create or replace. */
export const PUT = adminRoute<Params>(async ({ req, params, ctx }) => {
  await setFlagOverride(ctx, decodeURIComponent(params.key), (await readJson(req)) as FlagOverrideInput);
  return null;
});

/** DELETE /api/admin/feature-flags/:key/overrides?organizationId= */
export const DELETE = adminRoute<Params>(async ({ req, params, ctx }) => {
  const organizationId = req.nextUrl.searchParams.get("organizationId");
  if (!organizationId) throw new ValidationError("organizationId is required.");
  await removeFlagOverride(ctx, decodeURIComponent(params.key), organizationId);
  return null;
});
