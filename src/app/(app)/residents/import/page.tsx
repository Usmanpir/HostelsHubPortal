import { PageHeader } from "@/components/shared/page-header";
import { ResidentImportWizard } from "@/components/residents/import-wizard";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";

export const metadata = { title: "Import residents" };

export default async function ImportResidentsPage() {
  const ctx = await requireTenantPage("residents.manage");
  return (
    <>
      <PageHeader
        title="Import residents"
        description="Bring existing resident records in from Excel or CSV. Every row is checked with the same rules as adding a resident by hand."
        breadcrumbs={[{ label: "Residents", href: "/residents" }, { label: "Import" }]}
      />
      <ResidentImportWizard canAssignBeds={can(ctx, "assignments.manage")} />
    </>
  );
}
