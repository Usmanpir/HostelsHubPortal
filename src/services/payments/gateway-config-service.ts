import "server-only";
import { prisma, type DbClient } from "@/lib/db/prisma";
import type { PaymentProvider } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { BusinessRuleError } from "@/lib/errors";
import { decryptJson, encryptJson } from "@/lib/security/crypto";
import { actorOf, requirePermission, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import {
  CONFIGURABLE_PROVIDERS,
  gatewayConfigSchema,
  type ConfigurableProvider,
  type GatewayConfigInput,
} from "@/lib/validation/payments";
import { getAdapter, ipnUrlFor, returnUrlFor } from "./registry";
import { simulatorEnabled } from "./simulator";
import type { GatewayCredentials } from "./types";

/**
 * Per-organization merchant accounts. Secrets are decrypted only inside this
 * module and the payment service; the settings screen receives nothing but
 * "saved" flags for each secret field.
 */

const configSelect = {
  id: true,
  provider: true,
  enabled: true,
  environment: true,
  merchantId: true,
  subMerchantId: true,
  secretsEncrypted: true,
  secretKeys: true,
  lastTestedAt: true,
  lastTestOk: true,
  lastTestMessage: true,
  updatedAt: true,
  updatedBy: { select: { name: true } },
} as const;

function readSecrets(encrypted: string | null): Record<string, string> {
  return encrypted ? decryptJson(encrypted) : {};
}

/** Decrypted credentials for server-side use (checkout, verification, inquiry). */
export async function loadGatewayCredentials(
  organizationId: string,
  provider: PaymentProvider,
  db: DbClient = prisma,
): Promise<(GatewayCredentials & { enabled: boolean }) | null> {
  if (provider === "SIMULATOR") {
    return simulatorEnabled() ? { environment: "SANDBOX", merchantId: "SIMULATOR", subMerchantId: null, secrets: {}, enabled: true } : null;
  }
  const row = await db.paymentGatewayConfig.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
    select: { enabled: true, environment: true, merchantId: true, subMerchantId: true, secretsEncrypted: true },
  });
  if (!row) return null;
  return {
    enabled: row.enabled,
    environment: row.environment,
    merchantId: row.merchantId ?? "",
    subMerchantId: row.subMerchantId,
    secrets: readSecrets(row.secretsEncrypted),
  };
}

export type GatewaySettingsView = Awaited<ReturnType<typeof getGatewaySettings>>;

export async function getGatewaySettings(ctx: TenantContext) {
  requirePermission(ctx, "settings.organization");
  const rows = await prisma.paymentGatewayConfig.findMany({ where: { organizationId: ctx.organizationId }, select: configSelect });
  const gateways = CONFIGURABLE_PROVIDERS.map((provider) => {
    const adapter = getAdapter(provider);
    const row = rows.find((r) => r.provider === provider);
    const saved = new Set(row?.secretKeys ?? []);
    const configured = !!row && adapter.isConfigured({ merchantId: row.merchantId ?? "", subMerchantId: row.subMerchantId, secrets: Object.fromEntries([...saved].map((k) => [k, "x"])) });
    return {
      provider,
      label: adapter.label,
      merchantIdLabel: adapter.merchantIdLabel,
      subMerchantIdLabel: adapter.subMerchantIdLabel,
      subMerchantIdRequired: adapter.subMerchantIdRequired,
      supportsInquiry: adapter.supportsInquiry,
      enabled: row?.enabled ?? false,
      environment: row?.environment ?? "SANDBOX",
      merchantId: row?.merchantId ?? "",
      subMerchantId: row?.subMerchantId ?? "",
      secretFields: adapter.secretFields.map((f) => ({ ...f, saved: saved.has(f.key) })),
      configured,
      returnUrl: returnUrlFor(provider),
      ipnUrl: ipnUrlFor(provider),
      lastTestedAt: row?.lastTestedAt ?? null,
      lastTestOk: row?.lastTestOk ?? null,
      lastTestMessage: row?.lastTestMessage ?? null,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy?.name ?? null,
    };
  });
  return {
    gateways,
    currency: ctx.organization.currency,
    simulator: simulatorEnabled(),
  };
}

export async function saveGatewayConfig(ctx: TenantContext, raw: GatewayConfigInput) {
  requirePermission(ctx, "settings.organization");
  const input = parseInput(gatewayConfigSchema, raw);
  const adapter = getAdapter(input.provider);
  const allowed = new Set(adapter.secretFields.map((f) => f.key));

  return prisma.$transaction(async (tx) => {
    const before = await tx.paymentGatewayConfig.findUnique({
      where: { organizationId_provider: { organizationId: ctx.organizationId, provider: input.provider } },
      select: configSelect,
    });
    const secrets = readSecrets(before?.secretsEncrypted ?? null);
    const changedSecrets: string[] = [];
    for (const key of input.clearSecrets) {
      if (allowed.has(key) && key in secrets) {
        delete secrets[key];
        changedSecrets.push(key);
      }
    }
    for (const [key, value] of Object.entries(input.secrets)) {
      const v = value.trim();
      if (!allowed.has(key) || !v) continue; // empty = keep the stored value
      if (secrets[key] !== v) changedSecrets.push(key);
      secrets[key] = v;
    }

    const merchantId = input.merchantId || null;
    const subMerchantId = input.subMerchantId || null;
    if (input.enabled) {
      if (ctx.organization.currency !== "PKR") {
        throw new BusinessRuleError(`${adapter.label} only accepts payments in PKR. Change your organization currency to PKR to enable it.`);
      }
      if (!adapter.isConfigured({ merchantId: merchantId ?? "", subMerchantId, secrets })) {
        const missing = [
          ...(merchantId ? [] : [adapter.merchantIdLabel]),
          ...(adapter.subMerchantIdLabel && adapter.subMerchantIdRequired && !subMerchantId ? [adapter.subMerchantIdLabel] : []),
          ...adapter.secretFields.filter((f) => f.required && !secrets[f.key]).map((f) => f.label)];
        throw new BusinessRuleError(`Enter all required credentials before enabling ${adapter.label} (${missing.join(", ")}).`);
      }
    }

    const secretKeys = Object.keys(secrets).filter((k) => allowed.has(k)).sort();
    const credentialsChanged =
      changedSecrets.length > 0 ||
      before?.merchantId !== merchantId ||
      before?.subMerchantId !== subMerchantId ||
      before?.environment !== input.environment;
    const data = {
      enabled: input.enabled,
      environment: input.environment,
      merchantId,
      subMerchantId,
      secretsEncrypted: secretKeys.length ? encryptJson(secrets) : null,
      secretKeys,
      updatedById: ctx.userId,
      // A previous "connection OK" no longer applies to different credentials.
      ...(credentialsChanged ? { lastTestedAt: null, lastTestOk: null, lastTestMessage: null } : {}),
    };
    await tx.paymentGatewayConfig.upsert({
      where: { organizationId_provider: { organizationId: ctx.organizationId, provider: input.provider } },
      create: { organizationId: ctx.organizationId, provider: input.provider, ...data },
      update: data,
    });

    const view = (r: { enabled: boolean; environment: string; merchantId: string | null; subMerchantId: string | null; secretKeys: string[] } | null) =>
      r ? { enabled: r.enabled, environment: r.environment, merchantId: r.merchantId, subMerchantId: r.subMerchantId, secretKeys: r.secretKeys } : null;
    await audit(
      actorOf(ctx),
      {
        action: "settings.payment_gateway_updated",
        entityType: "PaymentGatewayConfig",
        entityId: input.provider,
        before: view(before),
        after: view({ ...data }),
        // Only the names of changed secrets are recorded — never their values.
        metadata: { provider: input.provider, secretsChanged: changedSecrets },
      },
      tx,
    );
    return { provider: input.provider, enabled: input.enabled };
  });
}

export async function testGatewayConnection(ctx: TenantContext, rawProvider: string) {
  requirePermission(ctx, "settings.organization");
  const provider = (CONFIGURABLE_PROVIDERS as readonly string[]).includes(rawProvider) ? (rawProvider as ConfigurableProvider) : null;
  if (!provider) throw new BusinessRuleError("Unknown payment provider.");
  const adapter = getAdapter(provider);
  const creds = await loadGatewayCredentials(ctx.organizationId, provider);
  if (!creds || !adapter.isConfigured(creds)) {
    throw new BusinessRuleError(`Save your ${adapter.label} credentials first.`);
  }
  let result: { ok: boolean; message: string };
  try {
    result = await adapter.testConnection(creds);
  } catch (error) {
    console.error(`[payments] ${provider} connection test failed`, error);
    result = { ok: false, message: "Could not reach the gateway. Check the environment and try again." };
  }
  await prisma.$transaction(async (tx) => {
    await tx.paymentGatewayConfig.update({
      where: { organizationId_provider: { organizationId: ctx.organizationId, provider } },
      data: { lastTestedAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message.slice(0, 300) },
    });
    await audit(
      actorOf(ctx),
      { action: "settings.payment_gateway_tested", entityType: "PaymentGatewayConfig", entityId: provider, metadata: { provider, ok: result.ok } },
      tx,
    );
  });
  return result;
}
