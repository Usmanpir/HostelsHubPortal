import { PageHeader } from "@/components/shared/page-header";
import { OwnerForm } from "@/components/owners/owner-form";
import { OwnersModuleDisabled } from "@/components/owners/owners-module-disabled";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { termsFor } from "@/lib/terms";
import { isOwnersEnabled } from "@/services/owners/scope";

export const metadata = { title: "Add owner" };

export default async function NewOwnerPage() {
  const ctx = await requireTenantPage("owners.manage");
  if (!isOwnersEnabled(ctx)) return <OwnersModuleDisabled canEnable={can(ctx, "settings.organization")} title="Add owner" />;
  const terms = termsFor(ctx.organization.businessType);
  return (
    <>
      <PageHeader
        title="Add owner"
        breadcrumbs={[{ label: "Owners", href: "/owners" }, { label: "New" }]}
        description={`You can link their ${terms.properties.toLowerCase()} right after saving.`}
      />
      <OwnerForm />
    </>
  );
}
