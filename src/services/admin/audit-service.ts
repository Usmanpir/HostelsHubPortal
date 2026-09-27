import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { serialize } from "@/lib/serialize";
import { paginate, toPaginated } from "@/lib/validation/common";
import { parseInput } from "@/lib/validation/parse";
import { adminAuditListSchema, type AdminAuditListInput } from "@/lib/validation/admin";
import { assertAdmin, type AdminContext } from "./guard";
import { platformActivityWhere } from "./overview-service";

/**
 * Platform-wide audit trail. Tenant entries are listed as metadata only
 * (action, entity type, organization, actor email, time, IP); their
 * before/after payloads may contain tenant data and are never returned.
 * Metadata is included only for `admin.*` actions performed by operators.
 */
export async function listPlatformAudit(ctx: AdminContext, raw: AdminAuditListInput = {}) {
  assertAdmin(ctx);
  const input = parseInput(adminAuditListSchema, raw);
  const { skip, take, page, pageSize } = paginate(input);
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      input.scope === "admin" ? { action: { startsWith: "admin." } } : input.scope === "platform" ? platformActivityWhere() : {},
      input.organizationId ? { organizationId: input.organizationId } : {},
      input.q
        ? {
            OR: [
              { action: { contains: input.q, mode: "insensitive" } },
              { entityType: { contains: input.q, mode: "insensitive" } },
              { user: { email: { contains: input.q, mode: "insensitive" } } },
              { organization: { name: { contains: input.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
        metadata: true,
        organization: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const items = rows.map(({ metadata, entityId, ...r }) => {
    const isAdmin = r.action.startsWith("admin.");
    return {
      ...r,
      // Entity ids of tenant records are withheld too; admin targets are platform objects.
      entityId: isAdmin ? entityId : null,
      metadata: isAdmin && metadata ? JSON.stringify(metadata, null, 2) : null,
      isAdmin,
    };
  });
  return serialize(toPaginated(items, total, page, pageSize));
}
