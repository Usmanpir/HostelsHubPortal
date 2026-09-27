import { readJson, tenantRoute } from "@/lib/api/handler";
import { updateInvoiceSettings } from "@/services/organization/settings-service";
import type { InvoiceSettingsInput } from "@/lib/validation/settings";

/** PATCH /api/organizations/invoice-settings */
export const PATCH = tenantRoute(async ({ req, ctx }) =>
  updateInvoiceSettings(ctx, (await readJson(req)) as InvoiceSettingsInput),
);
