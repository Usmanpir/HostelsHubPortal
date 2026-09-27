import type { Prisma } from "@/generated/prisma/client";
import { listHostelIds, type TenantContext } from "@/lib/tenant/context";

/**
 * Staff belong to the organization and are linked to hostels through
 * StaffHostelAssignment, so hostel scoping goes through that relation.
 *
 * `staffScopeWhere` — for lists; honours the header switcher (or an explicit
 * hostel filter). Restricted members only see staff assigned to at least one
 * of their hostels.
 */
export function staffScopeWhere(ctx: TenantContext, requestedHostelId?: string | null): Prisma.StaffWhereInput {
  const ids = listHostelIds(ctx, requestedHostelId);
  return {
    organizationId: ctx.organizationId,
    ...(ids ? { hostels: { some: { hostelId: { in: ids } } } } : {}),
  };
}

/** For single-record lookups: ignores the switcher, enforces hostel access. */
export function staffAccessWhere(ctx: TenantContext): Prisma.StaffWhereInput {
  return {
    organizationId: ctx.organizationId,
    ...(ctx.allHostels ? {} : { hostels: { some: { hostelId: { in: ctx.accessibleHostelIds } } } }),
  };
}
