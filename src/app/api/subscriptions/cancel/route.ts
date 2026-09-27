import { tenantRoute } from "@/lib/api/handler";
import { cancelSubscription, getBillingOverview, resumeSubscription } from "@/services/organization/subscription-service";

/** POST /api/subscriptions/cancel — cancel at the end of the current period. */
export const POST = tenantRoute(async ({ ctx }) => {
  await cancelSubscription(ctx);
  return getBillingOverview(ctx);
});

/** DELETE /api/subscriptions/cancel — undo a scheduled cancellation (resume). */
export const DELETE = tenantRoute(async ({ ctx }) => {
  await resumeSubscription(ctx);
  return getBillingOverview(ctx);
});
