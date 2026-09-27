import { readJson } from "@/lib/api/handler";
import type { SubscriptionStatusInput } from "@/lib/validation/admin";
import { setSubscriptionStatus } from "@/services/admin/subscription-service";
import { adminRoute } from "../../_lib/handler";

/** PATCH /api/admin/subscriptions/:id { status: "ACTIVE" | "EXPIRED" } */
export const PATCH = adminRoute<{ id: string }>(async ({ req, params, ctx }) => {
  await setSubscriptionStatus(ctx, params.id, (await readJson(req)) as SubscriptionStatusInput);
  return null;
});
