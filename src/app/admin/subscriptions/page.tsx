import { PageHeader } from "@/components/shared/page-header";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { SubscriptionsTable } from "@/components/admin/subscriptions-table";
import { requireAdminPage } from "@/services/admin/guard";
import { listSubscriptions } from "@/services/admin/subscription-service";
import { listPlanOptions } from "@/services/admin/plan-service";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { SUBSCRIPTION_STATUSES } from "@/lib/validation/admin";
import { optionsFrom, subscriptionStatusLabels } from "@/config/labels";

export const metadata = { title: "Subscriptions" };

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAdminPage();
  const params = await searchParams;
  const [data, plans] = await Promise.all([
    listSubscriptions(ctx, {
      q: sp(params, "q"),
      status: spEnum(params, "status", SUBSCRIPTION_STATUSES),
      planId: sp(params, "planId"),
      page: spNumber(params, "page", 1),
      pageSize: spNumber(params, "pageSize", 20),
    }),
    listPlanOptions(ctx),
  ]);

  return (
    <>
      <PageHeader title="Subscriptions" description="Sorted by the soonest trial end or renewal.">
        <PrivacyNotice />
      </PageHeader>
      <SubscriptionsTable
        data={data}
        filters={[
          { key: "status", label: "Status", options: optionsFrom(subscriptionStatusLabels) },
          { key: "planId", label: "Plan", options: plans.map((p) => ({ value: p.id, label: p.name })) },
        ]}
      />
    </>
  );
}
