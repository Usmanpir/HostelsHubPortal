import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/lib/validation/parse";
import { KNOWN_SETTINGS, SETTING_KEY_SCHEMA, systemSettingSchema, type SystemSettingInput } from "@/lib/validation/admin";
import { adminAudit, assertAdmin, type AdminContext } from "./guard";

/**
 * Read a platform setting. Returns `fallback` when the key is missing or the
 * stored value's JSON type doesn't match the fallback's (for primitives /
 * arrays / objects), so callers always get a value of the expected shape.
 */
export async function getSystemSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key }, select: { value: true } });
    if (!row || row.value === null) return fallback;
    const value = row.value as unknown;
    if (fallback !== null && fallback !== undefined) {
      const kind = (v: unknown) => (Array.isArray(v) ? "array" : typeof v);
      if (kind(value) !== kind(fallback)) return fallback;
    }
    return value as T;
  } catch (error) {
    console.error("[settings] read failed", error);
    return fallback;
  }
}

export async function listSystemSettings(ctx: AdminContext) {
  assertAdmin(ctx);
  const rows = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  const existing = new Set(rows.map((r) => r.key));
  return {
    settings: rows.map((r) => ({
      key: r.key,
      value: JSON.stringify(r.value, null, 2),
      updatedAt: r.updatedAt,
      description: r.key in KNOWN_SETTINGS ? KNOWN_SETTINGS[r.key as keyof typeof KNOWN_SETTINGS].description : null,
    })),
    // Well-known keys that haven't been set yet, offered as presets in the editor.
    suggestions: Object.entries(KNOWN_SETTINGS)
      .filter(([key]) => !existing.has(key))
      .map(([key, def]) => ({ key, description: def.description, example: def.example })),
  };
}

export async function upsertSystemSetting(ctx: AdminContext, raw: SystemSettingInput) {
  assertAdmin(ctx);
  const input = parseInput(systemSettingSchema, raw);
  const value = JSON.parse(input.value) as Prisma.InputJsonValue;
  await prisma.$transaction(async (tx) => {
    const before = await tx.systemSetting.findUnique({ where: { key: input.key }, select: { value: true } });
    await tx.systemSetting.upsert({ where: { key: input.key }, create: { key: input.key, value }, update: { value } });
    await adminAudit(
      ctx,
      {
        action: before ? "admin.setting.updated" : "admin.setting.created",
        entityType: "SystemSetting",
        entityId: input.key,
        before: before ? { value: before.value } : undefined,
        after: { value },
      },
      tx,
    );
  });
}

export async function deleteSystemSetting(ctx: AdminContext, rawKey: string) {
  assertAdmin(ctx);
  const key = parseInput(SETTING_KEY_SCHEMA, rawKey);
  await prisma.$transaction(async (tx) => {
    const before = await tx.systemSetting.findUnique({ where: { key }, select: { value: true } });
    if (!before) throw new NotFoundError("Setting");
    await tx.systemSetting.delete({ where: { key } });
    await adminAudit(ctx, { action: "admin.setting.deleted", entityType: "SystemSetting", entityId: key, before: { value: before.value } }, tx);
  });
}
