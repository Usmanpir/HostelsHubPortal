import { readJson, tenantRoute } from "@/lib/api/handler";
import { updateNotificationSettings } from "@/services/organization/settings-service";
import type { NotificationSettingsInput } from "@/lib/validation/settings";

/** PATCH /api/organizations/notification-settings — { email, events: { PAYMENT_RECEIVED: true, … } } */
export const PATCH = tenantRoute(async ({ req, ctx }) =>
  updateNotificationSettings(ctx, (await readJson(req)) as NotificationSettingsInput),
);
