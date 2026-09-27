import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/errors";

/**
 * Context for the resident portal. A resident can only ever see records
 * where residentId = this resident; every portal query filters by it.
 */
export type ResidentContext = {
  userId: string;
  residentId: string;
  organizationId: string;
  hostelId: string;
  name: string;
  organization: { id: string; name: string; currency: string; timezone: string; locale: string; brandName: string | null; logoFileId: string | null };
};

export const getResidentContext = cache(async (): Promise<ResidentContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const resident = await prisma.resident.findFirst({
    where: {
      userId: user.id,
      archivedAt: null,
      status: { not: "ARCHIVED" },
      organization: { status: "ACTIVE", deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      organizationId: true,
      hostelId: true,
      firstName: true,
      lastName: true,
      organization: {
        select: { id: true, name: true, currency: true, timezone: true, locale: true, brandName: true, logoFileId: true },
      },
    },
  });
  if (!resident) return null;
  return {
    userId: user.id,
    residentId: resident.id,
    organizationId: resident.organizationId,
    hostelId: resident.hostelId,
    name: `${resident.firstName} ${resident.lastName}`,
    organization: resident.organization,
  };
});

export async function requireResidentPage(): Promise<ResidentContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getResidentContext();
  if (!ctx) redirect("/dashboard");
  return ctx;
}

export async function residentOrThrow(): Promise<ResidentContext> {
  const ctx = await getResidentContext();
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
}
