import { PageHeader } from "@/components/shared/page-header";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { OrganizationsTable } from "@/components/admin/organizations-table";
import { organizationStatusLabels } from "@/components/admin/labels";
import { requireAdminPage } from "@/services/admin/guard";
import { listOrganizations } from "@/services/admin/organization-service";
import { listPlanOptions } from "@/services/admin/plan-service";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { ORGANIZATION_STATUSES, SUBSCRIPTION_STATUSES } from "@/lib/validation/admin";
import { optionsFrom, subscriptionStatusLabels } from "@/config/labels";

export const metadata = { title: "Organizations" };

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAdminPage();
  const params = await searchParams;
  const [data, plans] = await Promise.all([
    listOrganizations(ctx, {
      q: sp(params, "q"),
      status: spEnum(params, "status", ORGANIZATION_STATUSES),
      subscription: spEnum(params, "subscription", SUBSCRIPTION_STATUSES),
      planId: sp(params, "planId"),
      page: spNumber(params, "page", 1),
      pageSize: spNumber(params, "pageSize", 20),
    }),
    listPlanOptions(ctx),
  ]);

  return (
    <>
      <PageHeader title="Organizations" description={`${data.total} tenant organization${data.total === 1 ? "" : "s"} on the platform.`}>
        <PrivacyNotice />
      </PageHeader>
      <OrganizationsTable
        data={data}
        filters={[
          { key: "status", label: "Status", options: optionsFrom(organizationStatusLabels) },
          { key: "subscription", label: "Subscription", options: optionsFrom(subscriptionStatusLabels) },
          { key: "planId", label: "Plan", options: plans.map((p) => ({ value: p.id, label: p.name })) },
        ]}
      />
    </>
  );
}
