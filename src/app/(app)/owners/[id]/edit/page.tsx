import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { OwnerForm } from "@/components/owners/owner-form";
import { OwnersModuleDisabled } from "@/components/owners/owners-module-disabled";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { getOwner } from "@/services/owners/owner-service";
import { isOwnersEnabled } from "@/services/owners/scope";

export const metadata = { title: "Edit owner" };

export default async function EditOwnerPage({ params }: PageProps<"/owners/[id]/edit">) {
  const ctx = await requireTenantPage("owners.manage");
  if (!isOwnersEnabled(ctx)) return <OwnersModuleDisabled canEnable={can(ctx, "settings.organization")} title="Edit owner" />;
  const { id } = await params;
  // Viewing the form needs owners.view too (the service re-checks both).
  if (!can(ctx, "owners.view")) redirect("/owners");
  const owner = await loadOr404(getOwner(ctx, id));
  if (owner.archivedAt) redirect(`/owners/${owner.id}`);
  return (
    <>
      <PageHeader
        title={`Edit ${owner.name}`}
        breadcrumbs={[
          { label: "Owners", href: "/owners" },
          { label: owner.name, href: `/owners/${owner.id}` },
          { label: "Edit" },
        ]}
      />
      <OwnerForm
        ownerId={owner.id}
        initial={{
          name: owner.name,
          phone: owner.phone ?? "",
          email: owner.email ?? "",
          idNumber: owner.idNumber ?? "",
          address: owner.address ?? "",
          bankName: owner.bankName ?? "",
          bankAccountTitle: owner.bankAccountTitle ?? "",
          bankAccountNumber: owner.bankAccountNumber ?? "",
          commissionPercent: owner.commissionPercent,
          notes: owner.notes ?? "",
        }}
      />
    </>
  );
}
