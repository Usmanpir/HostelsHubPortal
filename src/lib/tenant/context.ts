import type { DbClient } from "@/lib/db/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { isPermission, type Permission } from "@/lib/permissions/catalog";
import type { BusinessType } from "@/generated/prisma/enums";

/**
 * Everything a service needs to authorize a request. It is always built on
 * the server from the authenticated user id + database — never from values
 * sent by the client. Only `activeHostelId` / `organizationId` *preferences*
 * come from cookies, and both are validated against the user's memberships.
 */
export type TenantContext = {
  userId: string;
  userName: string;
  userEmail: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    timezone: string;
    locale: string;
    logoFileId: string | null;
    brandName: string | null;
    primaryColor: string | null;
    onboardingCompletedAt: Date | null;
    businessType: BusinessType;
    ownersEnabled: boolean;
    dealerEnabled: boolean;
    publicListingsEnabled: boolean;
  };
  memberId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isOwner: boolean;
  permissions: ReadonlySet<Permission>;
  /** Member can see every hostel in the organization. */
  allHostels: boolean;
  /** Every hostel this member may access (includes archived, for history). */
  accessibleHostelIds: string[];
  /** Hostel chosen in the header switcher, or null for "All hostels". */
  activeHostelId: string | null;
  /** Linked staff profile, if the user is also an employee. */
  staffId: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type LoadContextInput = {
  userId: string;
  preferredOrganizationId?: string | null;
  preferredHostelId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Resolve the tenant context for a user. Returns null when the user has no
 * active membership (e.g. a resident-only account or a brand-new signup).
 */
export async function loadTenantContext(db: DbClient, input: LoadContextInput): Promise<TenantContext | null> {
  const memberships = await db.organizationMember.findMany({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      organization: { status: "ACTIVE", deletedAt: null },
      user: { status: "ACTIVE" },
    },
    include: {
      user: { select: { name: true, email: true } },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          timezone: true,
          locale: true,
          logoFileId: true,
          brandName: true,
          primaryColor: true,
          onboardingCompletedAt: true,
          businessType: true,
          ownersEnabled: true,
          dealerEnabled: true,
          publicListingsEnabled: true,
        },
      },
      role: { include: { permissions: true } },
      hostelAccess: { select: { hostelId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const member =
    memberships.find((m) => m.organizationId === input.preferredOrganizationId) ?? memberships[0]!;

  let accessibleHostelIds: string[];
  if (member.allHostels) {
    const hostels = await db.hostel.findMany({
      where: { organizationId: member.organizationId },
      select: { id: true },
    });
    accessibleHostelIds = hostels.map((h) => h.id);
  } else {
    accessibleHostelIds = member.hostelAccess.map((a) => a.hostelId);
  }

  const activeHostelId =
    input.preferredHostelId && accessibleHostelIds.includes(input.preferredHostelId)
      ? input.preferredHostelId
      : // Members restricted to exactly one hostel are always scoped to it.
        !member.allHostels && accessibleHostelIds.length === 1
        ? accessibleHostelIds[0]!
        : null;

  const staff = await db.staff.findFirst({
    where: { organizationId: member.organizationId, userId: input.userId, archivedAt: null },
    select: { id: true },
  });

  const permissions = new Set<Permission>(
    member.role.permissions.map((p) => p.permission).filter(isPermission),
  );

  return {
    userId: input.userId,
    userName: member.user.name,
    userEmail: member.user.email,
    organizationId: member.organizationId,
    organization: member.organization,
    memberId: member.id,
    roleId: member.roleId,
    roleKey: member.role.key,
    roleName: member.role.name,
    isOwner: member.isOwner,
    permissions,
    allHostels: member.allHostels,
    accessibleHostelIds,
    activeHostelId,
    staffId: staff?.id ?? null,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  };
}

// ─── Authorization helpers ──────────────────────────────────────────────────

export function can(ctx: Pick<TenantContext, "permissions">, permission: Permission) {
  return ctx.permissions.has(permission);
}

export function canAny(ctx: Pick<TenantContext, "permissions">, ...permissions: Permission[]) {
  return permissions.some((p) => ctx.permissions.has(p));
}

export function requirePermission(ctx: TenantContext | null | undefined, ...permissions: Permission[]): asserts ctx is TenantContext {
  if (!ctx) throw new UnauthenticatedError();
  for (const p of permissions) {
    if (!ctx.permissions.has(p)) throw new ForbiddenError();
  }
}

export function requireAnyPermission(ctx: TenantContext | null | undefined, ...permissions: Permission[]): asserts ctx is TenantContext {
  if (!ctx) throw new UnauthenticatedError();
  if (!permissions.some((p) => ctx.permissions.has(p))) throw new ForbiddenError();
}

/** Throws NotFound (not Forbidden) so IDs from other hostels are not confirmed to exist. */
export function assertHostelAccess(ctx: TenantContext, hostelId: string) {
  if (!ctx.accessibleHostelIds.includes(hostelId)) throw new NotFoundError("Hostel");
}

export function hasHostelAccess(ctx: TenantContext, hostelId: string | null | undefined) {
  return !!hostelId && ctx.accessibleHostelIds.includes(hostelId);
}

/**
 * Hostel ids to filter *list* queries by, honouring the header switcher.
 * `undefined` means "no hostel filter" (org-wide member viewing all hostels).
 */
export function listHostelIds(ctx: TenantContext, requestedHostelId?: string | null): string[] | undefined {
  if (requestedHostelId) {
    return ctx.accessibleHostelIds.includes(requestedHostelId) ? [requestedHostelId] : [];
  }
  if (ctx.activeHostelId) return [ctx.activeHostelId];
  if (ctx.allHostels) return undefined;
  return ctx.accessibleHostelIds;
}

/** `where` fragment for tenant-scoped list queries on hostel-owned models. */
export function scopedWhere(ctx: TenantContext, requestedHostelId?: string | null) {
  const ids = listHostelIds(ctx, requestedHostelId);
  return {
    organizationId: ctx.organizationId,
    ...(ids ? { hostelId: { in: ids } } : {}),
  };
}

/** `where` fragment for fetching a single hostel-owned record by id. */
export function accessWhere(ctx: TenantContext) {
  return {
    organizationId: ctx.organizationId,
    ...(ctx.allHostels ? {} : { hostelId: { in: ctx.accessibleHostelIds } }),
  };
}

export function actorOf(ctx: TenantContext) {
  return {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  };
}
