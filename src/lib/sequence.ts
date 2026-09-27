import type { DbClient } from "@/lib/db/prisma";

/**
 * Atomically increments a per-organization counter and returns the new value.
 * Safe under concurrency: the upsert takes a row lock.
 */
export async function nextSequence(db: DbClient, organizationId: string, key: string): Promise<number> {
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" ("organizationId", "key", "value")
    VALUES (${organizationId}, ${key}, 1)
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "Sequence"."value" + 1
    RETURNING "value"`;
  return Number(rows[0]!.value);
}

export function formatNumber(prefix: string, value: number, width = 5) {
  return `${prefix}-${String(value).padStart(width, "0")}`;
}

export async function nextCode(db: DbClient, organizationId: string, key: string, prefix: string, width = 5) {
  return formatNumber(prefix, await nextSequence(db, organizationId, key), width);
}
