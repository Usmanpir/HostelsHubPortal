import { deleteSystemSetting } from "@/services/admin/system-settings";
import { adminRoute } from "../../_lib/handler";

/** DELETE /api/admin/settings/:key */
export const DELETE = adminRoute<{ key: string }>(async ({ params, ctx }) => {
  await deleteSystemSetting(ctx, decodeURIComponent(params.key));
  return null;
});
