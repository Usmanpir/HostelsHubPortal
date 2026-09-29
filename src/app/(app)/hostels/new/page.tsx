import { PageHeader } from "@/components/shared/page-header";
import { HostelForm } from "@/components/hostels/hostel-form";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { listStaffOptions } from "@/services/hostel/staff-options";
import { listOwnerOptions } from "@/services/hostel/owner-options";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: `Add ${termsFor(ctx?.organization.businessType).property.toLowerCase()}` };
}

export default async function NewHostelPage() {
  const ctx = await requireTenantPage("hostels.manage");
  const t = termsFor(ctx.organization.businessType);
  const [managers, owners] = await Promise.all([listStaffOptions(ctx), listOwnerOptions(ctx)]);
  const hostelOrg = ctx.organization.businessType === "HOSTELS";
  return (
    <>
      <PageHeader
        title={`Add ${t.property.toLowerCase()}`}
        breadcrumbs={[{ label: t.properties, href: "/hostels" }, { label: "New" }]}
        description={
          hostelOrg
            ? "You can add floors, rooms and beds right after creating the hostel."
            : `You can add floors and ${t.units.toLowerCase()} right after creating the ${t.property.toLowerCase()}.`
        }
      />
      <HostelForm managers={managers} owners={owners} />
    </>
  );
}
