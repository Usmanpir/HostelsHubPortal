import Link from "next/link";
import { BadgeDollarSign, CircleDollarSign, Plus, Trophy, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ExportMenu } from "@/components/data-table/export-menu";
import { FilterBar } from "@/components/operations/filter-bar";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { DealBoard, DealEmpty, DealTable } from "@/components/real-estate/deal-list";
import { ViewSwitch } from "@/components/real-estate/view-switch";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { formatMoney } from "@/lib/format";
import { optionsFrom } from "@/config/labels";
import { dealStageLabels, dealTypeLabels } from "@/config/real-estate-labels";
import { DEAL_SORTS, DEAL_STAGES, DEAL_TYPES } from "@/lib/validation/real-estate";
import { getDealSummary, listDealBoard, listDeals } from "@/services/real-estate/deal-service";

export const metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const ctx = await requireTenantPage("deals.view");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Deals" canEnable={can(ctx, "settings.organization")} />;
  const params = await searchParams;
  const board = sp(params, "view") !== "list";
  const filters = {
    q: sp(params, "q"),
    type: spEnum(params, "type", DEAL_TYPES),
    commission: spEnum(params, "commission", ["paid", "unpaid"] as const),
    mine: sp(params, "mine") === "1",
  };
  const [summary, list, columns] = await Promise.all([
    getDealSummary(ctx),
    board
      ? null
      : listDeals(ctx, {
          ...filters,
          stage: spEnum(params, "stage", DEAL_STAGES),
          sort: spEnum(params, "sort", DEAL_SORTS),
          dir: spEnum(params, "dir", ["asc", "desc"] as const),
          page: spNumber(params, "page", 1),
          pageSize: spNumber(params, "pageSize", 20),
        }),
    board ? listDealBoard(ctx, filters) : null,
  ]);
  const { currency, locale } = ctx.organization;
  const money = (n: number) => formatMoney(n, currency, locale);
  const canManage = can(ctx, "deals.manage");
  const filtered = !!(filters.q || filters.type || filters.commission || filters.mine || sp(params, "stage"));
  const addButton = canManage ? (
    <Button asChild>
      <Link href="/deals/new">
        <Plus />
        New deal
      </Link>
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Deals"
        description="Sales and rentals in progress, closed deals and commissions."
        breadcrumbs={[{ label: "Sales & leasing" }, { label: "Deals" }]}
        actions={addButton}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pipeline value" value={money(summary.pipelineValue)} icon={CircleDollarSign} tone="info" hint={`${summary.pipelineCount} open deal${summary.pipelineCount === 1 ? "" : "s"}`} />
        <StatCard label="Won this month" value={money(summary.wonThisMonthValue)} icon={Trophy} tone="success" hint={`${summary.wonThisMonthCount} deal${summary.wonThisMonthCount === 1 ? "" : "s"} closed`} />
        <StatCard label="Commission earned" value={money(summary.commissionThisMonth)} icon={BadgeDollarSign} hint={`This month · ${money(summary.commissionEarned)} all time`} />
        <StatCard
          label="Commission unpaid"
          value={money(summary.commissionUnpaid)}
          icon={Wallet}
          tone={summary.commissionUnpaid > 0 ? "warning" : "default"}
          hint={`${summary.commissionUnpaidCount} won deal${summary.commissionUnpaidCount === 1 ? "" : "s"}`}
          href="/deals?view=list&commission=unpaid"
        />
      </div>
      <FilterBar
        searchPlaceholder="Search code, client or listing"
        filters={[
          ...(board ? [] : [{ key: "stage", label: "Stage", options: optionsFrom(dealStageLabels) }]),
          { key: "type", label: "Type", options: optionsFrom(dealTypeLabels) },
          {
            key: "commission",
            label: "Commission",
            options: [
              { value: "unpaid", label: "Commission unpaid" },
              { value: "paid", label: "Commission paid" },
            ],
          },
          { key: "mine", label: "Agents", options: [{ value: "1", label: "My deals" }] },
        ]}
        trailing={
          <>
            <ViewSwitch modes={["board", "list"]} clear={["page", "stage"]} />
            <ExportMenu endpoint="/api/deals/export" />
          </>
        }
      />
      {board && columns ? (
        columns.every((c) => c.total === 0) && !filtered ? (
          <DealEmpty filtered={false} action={addButton} />
        ) : (
          <DealBoard columns={columns} />
        )
      ) : list ? (
        <DealTable data={list} empty={<DealEmpty filtered={filtered} action={filtered ? null : addButton} />} />
      ) : null}
    </>
  );
}
