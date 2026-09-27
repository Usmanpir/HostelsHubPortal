import { readJson } from "@/lib/api/handler";
import type { FeatureFlagUpdateInput } from "@/lib/validation/admin";
import { deleteFeatureFlag, updateFeatureFlag } from "@/services/admin/feature-flags";
import { adminRoute } from "../../_lib/handler";

type Params = { key: string };

/** PATCH /api/admin/feature-flags/:key { enabled?, description? } */
export const PATCH = adminRoute<Params>(async ({ req, params, ctx }) =>
  updateFeatureFlag(ctx, decodeURIComponent(params.key), (await readJson(req)) as FeatureFlagUpdateInput),
);

/** DELETE /api/admin/feature-flags/:key — removes the flag and its overrides. */
export const DELETE = adminRoute<Params>(async ({ params, ctx }) => {
  await deleteFeatureFlag(ctx, decodeURIComponent(params.key));
  return null;
});
