import { PageHeader } from "@/components/shared/page-header";
import { PlanForm } from "@/components/admin/plan-form";
import { requireAdminPage } from "@/services/admin/guard";

export const metadata = { title: "New plan" };

export default async function AdminNewPlanPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader title="New plan" breadcrumbs={[{ label: "Plans", href: "/admin/plans" }, { label: "New" }]} />
      <PlanForm />
    </>
  );
}
