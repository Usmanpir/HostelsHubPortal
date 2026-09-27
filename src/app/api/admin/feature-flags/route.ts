import { readJson } from "@/lib/api/handler";
import type { FeatureFlagInput } from "@/lib/validation/admin";
import { createFeatureFlag, listFeatureFlags } from "@/services/admin/feature-flags";
import { adminRoute } from "../_lib/handler";

/** GET /api/admin/feature-flags — flags with their organization overrides. */
export const GET = adminRoute(async ({ ctx }) => listFeatureFlags(ctx));

/** POST /api/admin/feature-flags { key, description?, enabled? } */
export const POST = adminRoute(async ({ req, ctx }) => createFeatureFlag(ctx, (await readJson(req)) as FeatureFlagInput));
