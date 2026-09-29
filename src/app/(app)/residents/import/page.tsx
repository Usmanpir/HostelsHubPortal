import { PageHeader } from "@/components/shared/page-header";
import { ResidentImportWizard } from "@/components/residents/import-wizard";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { can } from "@/lib/tenant/context";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: `Import ${termsFor(ctx?.organization.businessType).residents.toLowerCase()}` };
}

export default async function ImportResidentsPage() {
  const ctx = await requireTenantPage("residents.manage");
  return (
    <>
      <PageHeader
        title={`Import ${termsFor(ctx.organization.businessType).residents.toLowerCase()}`}
        description="Bring existing resident records in from Excel or CSV. Every row is checked with the same rules as adding a resident by hand."
        breadcrumbs={[{ label: termsFor(ctx.organization.businessType).residents, href: "/residents" }, { label: "Import" }]}
      />
      <ResidentImportWizard canAssignBeds={can(ctx, "assignments.manage")} />
    </>
  );
}
