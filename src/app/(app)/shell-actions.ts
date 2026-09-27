"use server";

import { cookies } from "next/headers";
import { signOut } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { runAction } from "@/lib/actions";
import { NotFoundError } from "@/lib/errors";
import { HOSTEL_COOKIE, ORG_COOKIE, tenantOrThrow } from "@/lib/tenant/server";
import { getSessionUser } from "@/lib/auth/session";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

/** Header hostel switcher. `null` = all hostels. Validated against access. */
export async function setActiveHostelAction(hostelId: string | null) {
  return runAction(async () => {
    const ctx = await tenantOrThrow();
    const jar = await cookies();
    if (!hostelId) {
      jar.delete(HOSTEL_COOKIE);
      return null;
    }
    if (!ctx.accessibleHostelIds.includes(hostelId)) throw new NotFoundError("Hostel");
    jar.set(HOSTEL_COOKIE, hostelId, cookieOptions);
    return hostelId;
  });
}

/** Switch organization for users who belong to several. */
export async function setActiveOrganizationAction(organizationId: string) {
  return runAction(async () => {
    const user = await getSessionUser();
    if (!user) throw new NotFoundError("Organization");
    const member = await prisma.organizationMember.findFirst({
      where: { userId: user.id, organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!member) throw new NotFoundError("Organization");
    const jar = await cookies();
    jar.set(ORG_COOKIE, organizationId, cookieOptions);
    jar.delete(HOSTEL_COOKIE);
    return organizationId;
  });
}

export async function signOutAction() {
  const jar = await cookies();
  jar.delete(HOSTEL_COOKIE);
  await signOut({ redirectTo: "/login" });
}
