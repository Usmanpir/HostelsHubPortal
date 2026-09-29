import type { GatewayEnvironment, OnlinePaymentStatus, PaymentProvider } from "@/generated/prisma/enums";
import type { Tone } from "./labels";

export const paymentProviderLabels: Record<PaymentProvider, string> = {
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  SIMULATOR: "Test payment",
};

export const gatewayEnvironmentLabels: Record<GatewayEnvironment, string> = { SANDBOX: "Sandbox", LIVE: "Live" };

export const onlinePaymentStatusLabels: Record<OnlinePaymentStatus, string> = {
  PENDING: "Pending",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export const onlinePaymentStatusTones: Record<OnlinePaymentStatus, Tone> = {
  PENDING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
};
