import type { DbClient } from "./prisma";
import { DEFAULT_PLANS } from "@/config/plans";

/** Idempotently upsert the default SaaS plans and feature flags. */
export async function ensurePlans(db: DbClient) {
  for (const plan of DEFAULT_PLANS) {
    await db.plan.upsert({
      where: { key: plan.key },
      create: {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        currency: plan.currency,
        trialDays: plan.trialDays,
        limits: plan.limits,
        features: plan.features,
        sortOrder: plan.sortOrder,
        isPublic: true,
      },
      update: {},
    });
  }
  const flags = [
    { key: "resident-portal", description: "Resident self-service portal", enabled: true },
    { key: "email-notifications", description: "Send notification emails", enabled: true },
    { key: "online-payments", description: "Online rent payments (provider integration pending)", enabled: false },
    { key: "whatsapp-notifications", description: "WhatsApp delivery channel (not yet available)", enabled: false },
  ];
  for (const flag of flags) {
    await db.featureFlag.upsert({ where: { key: flag.key }, create: flag, update: {} });
  }
}
