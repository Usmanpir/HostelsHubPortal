import type { OwnerPayoutStatus } from "@/generated/prisma/enums";
import type { Tone } from "./labels";

/** Labels and badge tones for the property-owner (landlord) module. */

export const ownerPayoutStatusLabels: Record<OwnerPayoutStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const ownerPayoutStatusTones: Record<OwnerPayoutStatus, Tone> = {
  PENDING: "warning",
  PAID: "success",
  CANCELLED: "neutral",
};

export type StatementPreset = "this_month" | "last_month" | "custom";

export const statementPresetLabels: Record<StatementPreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  custom: "Custom",
};

export const feeSourceLabels = {
  PROPERTY: "Property rate",
  OWNER: "Owner default",
} as const;
