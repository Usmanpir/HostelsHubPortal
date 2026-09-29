import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/tenant/context";

/** Non-archived property owners as select options (property form owner picker). */
export async function listOwnerOptions(ctx: TenantContext) {
  if (!ctx.organization.ownersEnabled) return [];
  const owners = await prisma.propertyOwner.findMany({
    where: { organizationId: ctx.organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ownerCode: true, commissionPercent: true },
  });
  return owners.map((o) => ({
    id: o.id,
    name: `${o.name} (${o.ownerCode})`,
    commissionPercent: Number(o.commissionPercent),
  }));
}
