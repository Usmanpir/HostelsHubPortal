import type { BillingInterval } from "@/generated/prisma/enums";

/**
 * Payment-provider abstraction for SaaS billing. Business logic only talks to
 * this interface; a Stripe/Paddle/LemonSqueezy adapter implements it and
 * translates webhooks into `SubscriptionEvent`s handled by the subscription
 * service. No provider-specific logic lives outside its adapter.
 */
export type CheckoutRequest = {
  organizationId: string;
  organizationName: string;
  customerEmail: string;
  planKey: string;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  // Provider applied the change immediately (manual/offline billing).
  | { kind: "applied" };

export type SubscriptionEvent =
  | { type: "activated"; organizationId: string; planKey: string; interval: BillingInterval; periodEnd: Date; providerSubscriptionId?: string }
  | { type: "renewed"; organizationId: string; periodEnd: Date }
  | { type: "payment_failed"; organizationId: string }
  | { type: "canceled"; organizationId: string; atPeriodEnd: boolean };

export interface BillingProvider {
  readonly key: string;
  startCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  cancel(organizationId: string, providerSubscriptionId: string | null): Promise<void>;
  /** Verify and parse a webhook request into domain events. */
  parseWebhook?(request: Request): Promise<SubscriptionEvent[]>;
}

/**
 * Manual provider: plan changes take effect immediately and invoices are
 * settled offline (bank transfer etc.). Used until a card provider is added.
 */
export const manualBillingProvider: BillingProvider = {
  key: "manual",
  async startCheckout() {
    return { kind: "applied" };
  },
  async cancel() {},
};

export function getBillingProvider(): BillingProvider {
  // Register real providers here, e.g. `if (process.env.STRIPE_SECRET_KEY) return stripeProvider;`
  return manualBillingProvider;
}
