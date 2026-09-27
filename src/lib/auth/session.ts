import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isSuperAdmin: boolean;
  emailVerifiedAt: Date | null;
};

/**
 * The authenticated user, re-validated against the database on every request
 * so disabled accounts and password changes (sessionVersion bump) take effect
 * immediately even though the session cookie is a JWT.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      isSuperAdmin: true,
      emailVerifiedAt: true,
      status: true,
      sessionVersion: true,
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  if (user.sessionVersion !== session.user.sessionVersion) return null;
  const { status: _status, sessionVersion: _sv, ...rest } = user;
  return rest;
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!user.isSuperAdmin) redirect("/dashboard");
  return user;
}
