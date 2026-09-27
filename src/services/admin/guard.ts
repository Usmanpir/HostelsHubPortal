import "server-only";
import { headers } from "next/headers";
import { getSessionUser, requireSuperAdmin } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import type { DbClient } from "@/lib/db/prisma";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { clientIpFromHeaders } from "@/lib/security/request";

/**
 * Platform operator context. Super admins manage platform metadata only —
 * organizations, users, plans, subscriptions, flags and settings. Tenant
 * operational data (residents, staff, invoices, documents…) is private and is
 * never read by admin services beyond aggregate counts.
 */
export type AdminContext = {
  userId: string;
  email: string;
  name: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export const TENANT_PRIVACY_NOTICE = "Tenant data is private; support access requires the organization's consent.";

/** For API routes and server actions: throws 401/403 instead of redirecting. */
export async function adminOrThrow(): Promise<AdminContext> {
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();
  if (!user.isSuperAdmin) throw new ForbiddenError();
  let ipAddress: string | null = null;
  let userAgent: string | null = null;
  try {
    const hdrs = await headers();
    ipAddress = clientIpFromHeaders(hdrs);
    userAgent = hdrs.get("user-agent");
  } catch {
    // Outside a request scope.
  }
  return { userId: user.id, email: user.email, name: user.name, ipAddress, userAgent };
}

/** For admin pages: redirects non-super-admins (via requireSuperAdmin), then builds the context. */
export async function requireAdminPage(): Promise<AdminContext> {
  await requireSuperAdmin();
  return adminOrThrow();
}

/** Defence in depth: every admin service re-checks the context it was given. */
export function assertAdmin(ctx: AdminContext | null | undefined): asserts ctx is AdminContext {
  if (!ctx?.userId) throw new ForbiddenError();
}

/** Audit an admin action. Actions are always namespaced `admin.*`. */
export async function adminAudit(
  ctx: AdminContext,
  entry: {
    action: `admin.${string}`;
    entityType: string;
    entityId?: string | null;
    organizationId?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
  db?: DbClient,
) {
  await recordAudit(
    {
      organizationId: entry.organizationId ?? null,
      userId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before,
      after: entry.after,
      metadata: entry.metadata,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
    db,
  );
}
