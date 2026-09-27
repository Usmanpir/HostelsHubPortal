import { PageHeader } from "@/components/shared/page-header";
import { PlanForm } from "@/components/admin/plan-form";
import { requireAdminPage } from "@/services/admin/guard";
import { getPlan } from "@/services/admin/plan-service";
import { loadOr404 } from "@/lib/page-helpers";

export const metadata = { title: "Edit plan" };

export default async function AdminEditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminPage();
  const { id } = await params;
  const plan = await loadOr404(getPlan(ctx, id));
  return (
    <>
      <PageHeader
        title={`Edit ${plan.name}`}
        description="Changes apply to every organization on this plan immediately."
        breadcrumbs={[{ label: "Plans", href: "/admin/plans" }, { label: plan.name }]}
      />
      <PlanForm plan={plan} />
    </>
  );
}
