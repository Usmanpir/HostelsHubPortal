import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/tenant/context";

/** Organization details printed on invoices and receipts. */
export async function getOrganizationBranding(ctx: TenantContext) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: {
      name: true,
      brandName: true,
      logoFileId: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      country: true,
      invoiceFooter: true,
      taxLabel: true,
      currency: true,
      locale: true,
    },
  });
  return {
    name: org.brandName || org.name,
    legalName: org.name,
    logoUrl: org.logoFileId ? `/api/files/${org.logoFileId}` : null,
    email: org.email,
    phone: org.phone,
    address: [org.address, org.city, org.country].filter(Boolean).join(", ") || null,
    invoiceFooter: org.invoiceFooter,
    taxLabel: org.taxLabel || "Tax",
    currency: org.currency,
    locale: org.locale,
  };
}

export type OrganizationBranding = Awaited<ReturnType<typeof getOrganizationBranding>>;
