import type { Prisma } from "@/generated/prisma/client";
import { BusinessRuleError } from "@/lib/errors";
import type { Permission } from "@/lib/permissions/catalog";
import { requirePermission, type TenantContext } from "@/lib/tenant/context";

/**
 * Authorization + scoping shared by every owner/payout service.
 *
 * Visibility rule: a member who can see every property sees every owner. A
 * member restricted to some properties sees only owners whose *entire*
 * portfolio is within their access (owners with no properties included), so
 * statements and payout snapshots never leak figures from properties they
 * cannot open.
 */

export const OWNERS_DISABLED_MESSAGE = "The Owners module is turned off for this organization. Enable it in Settings.";

export function isOwnersEnabled(ctx: TenantContext) {
  return ctx.organization.ownersEnabled;
}

/** Permission check + module switch. Call first in every owners service function. */
export function requireOwners(ctx: TenantContext, permission: Permission) {
  requirePermission(ctx, permission);
  if (!ctx.organization.ownersEnabled) throw new BusinessRuleError(OWNERS_DISABLED_MESSAGE);
}

export function ownerWhere(ctx: TenantContext): Prisma.PropertyOwnerWhereInput {
  return ctx.allHostels
    ? { organizationId: ctx.organizationId }
    : { organizationId: ctx.organizationId, properties: { every: { id: { in: ctx.accessibleHostelIds } } } };
}

/** Properties (hostels) this member may access — ignores the header switcher on purpose. */
export function accessiblePropertyWhere(ctx: TenantContext): Prisma.HostelWhereInput {
  return {
    organizationId: ctx.organizationId,
    ...(ctx.allHostels ? {} : { id: { in: ctx.accessibleHostelIds } }),
  };
}
