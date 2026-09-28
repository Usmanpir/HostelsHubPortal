import { prisma, type DbClient } from "@/lib/db/prisma";
import { RateLimitError } from "@/lib/errors";

/**
 * Fixed-window rate limiter backed by PostgreSQL, so limits hold across
 * serverless instances. Swap for Redis/Upstash by reimplementing `hit`.
 */
export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 15 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  passwordReset: { limit: 5, windowSeconds: 60 * 60 },
  upload: { limit: 60, windowSeconds: 10 * 60 },
  api: { limit: 300, windowSeconds: 60 },
  // Each question can trigger several model + tool calls.
  assistant: { limit: 30, windowSeconds: 10 * 60 },
} satisfies Record<string, RateLimitRule>;

export async function hit(key: string, rule: RateLimitRule, db: DbClient = prisma) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + rule.windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."expiresAt" < ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" < ${now} THEN ${expiresAt} ELSE "RateLimitBucket"."expiresAt" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count) };
}

export async function enforceRateLimit(key: string, rule: RateLimitRule) {
  const result = await hit(key, rule);
  if (!result.allowed) throw new RateLimitError();
}

export async function resetRateLimit(key: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}
