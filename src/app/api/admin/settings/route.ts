import { readJson } from "@/lib/api/handler";
import type { SystemSettingInput } from "@/lib/validation/admin";
import { listSystemSettings, upsertSystemSetting } from "@/services/admin/system-settings";
import { adminRoute } from "../_lib/handler";

/** GET /api/admin/settings */
export const GET = adminRoute(async ({ ctx }) => listSystemSettings(ctx));

/** PUT /api/admin/settings { key, value } — value is JSON text, validated for well-known keys. */
export const PUT = adminRoute(async ({ req, ctx }) => {
  await upsertSystemSetting(ctx, (await readJson(req)) as SystemSettingInput);
  return listSystemSettings(ctx);
});
