import { prisma, type DbClient } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type AuditInput = {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** Actor information carried by a TenantContext (kept structural to avoid import cycles). */
export type AuditActor = {
  organizationId: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  // JSON round-trip turns Decimal/Date into strings and strips undefined.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Append an audit record. Pass the transaction client so the audit entry is
 * committed atomically with the change it describes.
 */
export async function recordAudit(input: AuditInput, db: DbClient = prisma) {
  const metadata =
    input.before !== undefined || input.after !== undefined || input.metadata
      ? toJson({ ...(input.metadata ?? {}), before: input.before, after: input.after })
      : undefined;
  await db.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
    },
  });
}

export function audit(
  actor: AuditActor,
  entry: Omit<AuditInput, "organizationId" | "userId" | "ipAddress" | "userAgent">,
  db: DbClient = prisma,
) {
  return recordAudit(
    {
      ...entry,
      organizationId: actor.organizationId,
      userId: actor.userId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    },
    db,
  );
}
