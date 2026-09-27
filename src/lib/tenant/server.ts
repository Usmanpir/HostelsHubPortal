import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/errors";
import type { Permission } from "@/lib/permissions/catalog";
import { clientIpFromHeaders } from "@/lib/security/request";
import { can, loadTenantContext, type TenantContext } from "./context";

export const ORG_COOKIE = "hms_org";
export const HOSTEL_COOKIE = "hms_hostel";

/** Tenant context for the current request, or null if the user has no organization. */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const jar = await cookies();
  const hdrs = await headers();
  return loadTenantContext(prisma, {
    userId: user.id,
    preferredOrganizationId: jar.get(ORG_COOKIE)?.value,
    preferredHostelId: jar.get(HOSTEL_COOKIE)?.value,
    ipAddress: clientIpFromHeaders(hdrs),
    userAgent: hdrs.get("user-agent"),
  });
});

/** For API routes and server actions: throws instead of redirecting. */
export async function tenantOrThrow(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
}

/**
 * For dashboard pages. Redirects anonymous users to login, users without an
 * organization to onboarding/portal, and users lacking `permission` to the
 * dashboard (or their task list).
 */
export async function requireTenantPage(permission?: Permission): Promise<TenantContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getTenantContext();
  if (!ctx) {
    const resident = await prisma.resident.findFirst({
      where: { userId: user.id, archivedAt: null },
      select: { id: true },
    });
    if (resident) redirect("/portal");
    if (user.isSuperAdmin) redirect("/admin");
    redirect("/onboarding");
  }
  if (permission && !can(ctx, permission)) {
    redirect(homePathFor(ctx, permission));
  }
  return ctx;
}

/** Landing page for a member, avoiding redirect loops for limited roles. */
export function homePathFor(ctx: TenantContext, denied?: Permission): string {
  if (can(ctx, "dashboard.view") && denied !== "dashboard.view") return denied ? "/dashboard?denied=1" : "/dashboard";
  if (can(ctx, "tasks.view") && denied !== "tasks.view") return "/tasks";
  return "/account";
}
