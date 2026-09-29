import { z } from "zod";

/** Providers an organization can configure in Settings → Online payments. */
export const CONFIGURABLE_PROVIDERS = ["JAZZCASH", "EASYPAISA"] as const;
export type ConfigurableProvider = (typeof CONFIGURABLE_PROVIDERS)[number];

/** Providers a resident can choose at checkout (SIMULATOR only outside production). */
export const CHECKOUT_PROVIDERS = ["JAZZCASH", "EASYPAISA", "SIMULATOR"] as const;

export const GATEWAY_ENVIRONMENTS = ["SANDBOX", "LIVE"] as const;

const publicId = z
  .string()
  .trim()
  .max(64, "Too long")
  .regex(/^[A-Za-z0-9._-]*$/, "Use letters, numbers, dots, dashes or underscores only");

/**
 * Secrets are write-only: an empty string means "keep the stored value".
 * `clearSecrets` lists secret keys to remove explicitly.
 */
export const gatewayConfigSchema = z.object({
  provider: z.enum(CONFIGURABLE_PROVIDERS),
  enabled: z.boolean(),
  environment: z.enum(GATEWAY_ENVIRONMENTS),
  merchantId: publicId,
  subMerchantId: publicId,
  secrets: z.record(z.string().max(64), z.string().max(512, "Too long")).default({}),
  clearSecrets: z.array(z.string().max(64)).max(20).default([]),
});
export type GatewayConfigInput = z.input<typeof gatewayConfigSchema>;

export const startOnlinePaymentSchema = z.object({
  invoiceId: z.string().min(1).max(64),
  provider: z.enum(CHECKOUT_PROVIDERS),
});
export type StartOnlinePaymentInput = z.input<typeof startOnlinePaymentSchema>;

export const PAYMENT_RESULT_PARAMS = ["success", "failed", "pending", "cancelled", "error"] as const;
export type PaymentResultParam = (typeof PAYMENT_RESULT_PARAMS)[number];
