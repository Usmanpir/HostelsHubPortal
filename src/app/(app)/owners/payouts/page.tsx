import { Banknote, CircleCheck, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { OwnersModuleDisabled } from "@/components/owners/owners-module-disabled";
import { PayoutsTable } from "@/components/owners/payouts-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { formatMoney, todayInTimeZone } from "@/lib/format";
import { optionsFrom } from "@/config/labels";
import { ownerPayoutStatusLabels } from "@/config/owner-labels";
import { listOwnerOptions } from "@/services/owners/owner-service";
import { listPayouts } from "@/services/owners/payout-service";
import { parsePayoutFilters } from "@/services/owners/filters";
import { isOwnersEnabled } from "@/services/owners/scope";

export const metadata = { title: "Owner payouts" };

export default async function OwnerPayoutsPage({ searchParams }: PageProps<"/owners/payouts">) {
  const ctx = await requireTenantPage("owners.view");
  if (!isOwnersEnabled(ctx)) return <OwnersModuleDisabled canEnable={can(ctx, "settings.organization")} title="Owner payouts" />;
  const params = await searchParams;
  const filters = parsePayoutFilters(params);
  const [data, owners] = await Promise.all([listPayouts(ctx, filters), listOwnerOptions(ctx, { includeArchived: true })]);
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const hasActiveFilters = !!(filters.q || filters.status || filters.ownerId || filters.from || filters.to);

  const tableFilters = [
    { key: "status", label: "Statuses", options: optionsFrom(ownerPayoutStatusLabels) },
    ...(owners.length > 1
      ? [
          {
            key: "owner",
            label: "Owners",
            options: owners.map((o) => ({ value: o.id, label: o.archivedAt ? `${o.name} (archived)` : o.name })),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Owner payouts"
        description="Amounts owed to owners, snapshotted from their statements. Create a payout from an owner's statement page."
        breadcrumbs={[{ label: "Owners", href: "/owners" }, { label: "Payouts" }]}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Pending"
          value={money(data.totals.PENDING.amount)}
          icon={Clock}
          tone={data.totals.PENDING.count > 0 ? "warning" : "default"}
          hint={`${data.totals.PENDING.count} payout${data.totals.PENDING.count === 1 ? "" : "s"} awaiting payment`}
        />
        <StatCard
          label="Paid"
          value={money(data.totals.PAID.amount)}
          icon={CircleCheck}
          tone="success"
          hint={`${data.totals.PAID.count} payout${data.totals.PAID.count === 1 ? "" : "s"}${hasActiveFilters ? " matching filters" : ""}`}
        />
        <StatCard
          label="Cancelled"
          value={data.totals.CANCELLED.count}
          icon={Banknote}
          hint="Kept on record, excluded from totals"
        />
      </div>

      <PayoutsTable
        data={data}
        filters={tableFilters}
        hasActiveFilters={hasActiveFilters}
        today={todayInTimeZone(ctx.organization.timezone)}
      />
    </>
  );
}
