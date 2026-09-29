import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { ScheduleViewingDialog } from "@/components/real-estate/viewing-dialogs";
import { ViewingList } from "@/components/real-estate/viewing-list";
import { UrlFlagToggle } from "@/components/real-estate/view-switch";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp } from "@/lib/page-helpers";
import { formatDate, todayInTimeZone } from "@/lib/format";
import { listViewingsGrouped } from "@/services/real-estate/viewing-service";
import { listLeadOptions } from "@/services/real-estate/lead-service";
import { listListingOptions } from "@/services/real-estate/listing-service";
import { listAgentOptions } from "@/services/real-estate/shared";

export const metadata = { title: "Viewings" };

export default async function ViewingsPage({ searchParams }: PageProps<"/leads/viewings">) {
  const ctx = await requireTenantPage("leads.view");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Viewings" canEnable={can(ctx, "settings.organization")} />;
  const params = await searchParams;
  const mine = sp(params, "mine") === "1";
  const canManage = can(ctx, "leads.manage");
  const [groups, leads, listings, agents] = await Promise.all([
    listViewingsGrouped(ctx, { mine }),
    canManage ? listLeadOptions(ctx) : Promise.resolve([]),
    canManage ? listListingOptions(ctx) : Promise.resolve([]),
    canManage ? listAgentOptions(ctx) : Promise.resolve([]),
  ]);
  const today = todayInTimeZone(ctx.organization.timezone);

  return (
    <>
      <PageHeader
        title="Viewings"
        description={`Property visits with clients. Times are shown in ${ctx.organization.timezone}.`}
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "Viewings" }]}
        actions={
          canManage ? (
            <ScheduleViewingDialog
              leads={leads}
              listings={listings}
              agents={agents}
              trigger={
                <Button>
                  <CalendarPlus />
                  Schedule viewing
                </Button>
              }
            />
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <UrlFlagToggle name="mine" labels={["Everyone", "My viewings"]} />
        {groups.needsOutcome ? <StatusBadge tone="warning">{groups.needsOutcome} past viewing{groups.needsOutcome === 1 ? "" : "s"} need an outcome</StatusBadge> : null}
      </div>

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">
            Today <span className="font-normal text-muted-foreground">· {formatDate(today, ctx.organization.locale)}</span>
          </h2>
          <ViewingList items={groups.today} canManage={canManage} agents={agents} timeOnly empty="No viewings today." />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Upcoming</h2>
          <ViewingList items={groups.upcoming} canManage={canManage} agents={agents} empty="Nothing scheduled after today." />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Past</h2>
          <ViewingList items={groups.past} canManage={canManage} agents={agents} empty="No past viewings." />
        </section>
      </div>
    </>
  );
}
