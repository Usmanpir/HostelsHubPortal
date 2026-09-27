import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { requireResidentPage } from "@/lib/tenant/resident";
import { OrgProvider } from "@/components/shared/org-context";
import { PortalShell } from "@/components/portal/portal-shell";
import { APP_NAME } from "@/config/defaults";

export const metadata: Metadata = { title: { default: "Resident portal", template: `%s · Resident portal` } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireResidentPage();
  const [resident, org] = await Promise.all([
    prisma.resident.findFirst({
      where: { id: ctx.residentId, organizationId: ctx.organizationId },
      select: { residentCode: true, email: true, hostel: { select: { name: true } }, user: { select: { email: true } } },
    }),
    prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { primaryColor: true } }),
  ]);
  const brandColor = org?.primaryColor && /^#[0-9a-f]{6}$/i.test(org.primaryColor) ? org.primaryColor : null;
  const o = ctx.organization;

  return (
    <OrgProvider
      value={{
        id: o.id,
        name: o.name,
        currency: o.currency,
        timezone: o.timezone,
        locale: o.locale,
        permissions: [],
        activeHostelId: null,
      }}
    >
      {brandColor ? <style>{`:root{--brand:${brandColor}}`}</style> : null}
      <PortalShell
        brand={{
          name: o.brandName || o.name || APP_NAME,
          logoUrl: o.logoFileId ? `/api/files/${o.logoFileId}` : null,
          hostelName: resident?.hostel.name ?? "",
        }}
        user={{
          name: ctx.name,
          email: resident?.user?.email ?? resident?.email ?? "",
          residentCode: resident?.residentCode ?? "",
        }}
      >
        {children}
      </PortalShell>
    </OrgProvider>
  );
}
