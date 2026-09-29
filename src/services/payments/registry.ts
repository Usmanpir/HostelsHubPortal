import type { PaymentProvider } from "@/generated/prisma/enums";
import { easypaisaAdapter } from "./easypaisa";
import { jazzcashAdapter } from "./jazzcash";
import { simulatorAdapter, simulatorEnabled } from "./simulator";
import type { PaymentGatewayAdapter } from "./types";

const ADAPTERS: Record<PaymentProvider, PaymentGatewayAdapter> = {
  JAZZCASH: jazzcashAdapter,
  EASYPAISA: easypaisaAdapter,
  SIMULATOR: simulatorAdapter,
};

export function getAdapter(provider: PaymentProvider): PaymentGatewayAdapter {
  return ADAPTERS[provider];
}

/** Map the `[provider]` URL segment to a provider; the simulator only exists outside production. */
export function providerFromSlug(slug: string): PaymentProvider | null {
  switch (slug.toLowerCase()) {
    case "jazzcash":
      return "JAZZCASH";
    case "easypaisa":
      return "EASYPAISA";
    case "simulator":
      return simulatorEnabled() ? "SIMULATOR" : null;
    default:
      return null;
  }
}

export function providerSlug(provider: PaymentProvider) {
  return provider.toLowerCase();
}

export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Where the gateway returns the customer (paste this into the merchant portal). */
export function returnUrlFor(provider: PaymentProvider) {
  return `${appBaseUrl()}/api/payments/online/${providerSlug(provider)}/return`;
}

/** Server-to-server notification endpoint (for gateways that offer IPN). */
export function ipnUrlFor(provider: PaymentProvider) {
  return `${appBaseUrl()}/api/payments/online/${providerSlug(provider)}/ipn`;
}
