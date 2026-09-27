import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata: Metadata = { title: { default: "Platform admin", template: "%s · Platform admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE", deletedAt: null } },
    select: { id: true },
  });
  return (
    <AdminShell user={{ name: user.name, email: user.email }} hasWorkspace={!!membership}>
      {children}
    </AdminShell>
  );
}
