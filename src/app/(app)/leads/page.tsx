import Link from "next/link";
import { AlarmClock, CalendarClock, Plus, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ExportMenu } from "@/components/data-table/export-menu";
import { FilterBar } from "@/components/operations/filter-bar";
import { DealerDisabled } from "@/components/real-estate/dealer-disabled";
import { LeadBoard, LeadEmpty, LeadTable } from "@/components/real-estate/lead-list";
import { ViewSwitch } from "@/components/real-estate/view-switch";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";
import { optionsFrom } from "@/config/labels";
import { leadSourceLabels, leadStageLabels } from "@/config/real-estate-labels";
import { LEAD_SORTS, LEAD_SOURCES, LEAD_STAGES } from "@/lib/validation/real-estate";
import { getLeadSummary, listLeadBoard, listLeads } from "@/services/real-estate/lead-service";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const ctx = await requireTenantPage("leads.view");
  if (!ctx.organization.dealerEnabled) return <DealerDisabled title="Leads" canEnable={can(ctx, "settings.organization")} />;
  const params = await searchParams;
  const board = sp(params, "view") !== "list";
  const filters = {
    q: sp(params, "q"),
    source: spEnum(params, "source", LEAD_SOURCES),
    mine: sp(params, "mine") === "1",
    followUp: spEnum(params, "followUp", ["today", "overdue", "due"] as const),
  };
  const [summary, list, columns] = await Promise.all([
    getLeadSummary(ctx),
    board
      ? null
      : listLeads(ctx, {
          ...filters,
          stage: spEnum(params, "stage", LEAD_STAGES),
          sort: spEnum(params, "sort", LEAD_SORTS),
          dir: spEnum(params, "dir", ["asc", "desc"] as const),
          page: spNumber(params, "page", 1),
          pageSize: spNumber(params, "pageSize", 20),
        }),
    board ? listLeadBoard(ctx, filters) : null,
  ]);
  const canManage = can(ctx, "leads.manage");
  const filtered = !!(filters.q || filters.source || filters.mine || filters.followUp || sp(params, "stage"));
  const addButton = canManage ? (
    <Button asChild>
      <Link href="/leads/new">
        <Plus />
        Add lead
      </Link>
    </Button>
  ) : null;

  const filterDefs = [
    ...(board ? [] : [{ key: "stage", label: "Stage", options: optionsFrom(leadStageLabels) }]),
    { key: "source", label: "Source", options: optionsFrom(leadSourceLabels) },
    { key: "mine", label: "Assignees", options: [{ value: "1", label: "Assigned to me" }] },
    {
      key: "followUp",
      label: "Follow-ups",
      options: [
        { value: "today", label: "Due today" },
        { value: "overdue", label: "Overdue" },
        { value: "due", label: "Due or overdue" },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description="Buyers and tenants you are working with, from first enquiry to closing."
        breadcrumbs={[{ label: "Sales & leasing" }, { label: "Leads" }]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/leads/viewings">
                <CalendarClock />
                Viewings
              </Link>
            </Button>
            {addButton}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open leads" value={summary.open} icon={Users} hint={`${summary.mine} assigned to you`} href="/leads?view=list&mine=1" />
        <StatCard label="New this week" value={summary.newThisWeek} icon={Sparkles} tone="info" />
        <StatCard label="Follow-ups today" value={summary.dueToday} icon={CalendarClock} tone={summary.dueToday ? "warning" : "default"} href="/leads?view=list&followUp=today" />
        <StatCard label="Overdue follow-ups" value={summary.overdue} icon={AlarmClock} tone={summary.overdue ? "danger" : "default"} href="/leads?view=list&followUp=overdue" />
      </div>
      <FilterBar
        filters={filterDefs}
        searchPlaceholder="Search name, code, phone or email"
        trailing={
          <>
            <ViewSwitch modes={["board", "list"]} clear={["page", "stage"]} />
            <ExportMenu endpoint="/api/leads/export" />
          </>
        }
      />
      {board && columns ? (
        columns.every((c) => c.total === 0) && !filtered ? (
          <LeadEmpty filtered={false} action={addButton} />
        ) : (
          <LeadBoard columns={columns} canManage={canManage} />
        )
      ) : list ? (
        <LeadTable data={list} empty={<LeadEmpty filtered={filtered} action={filtered ? null : addButton} />} />
      ) : null}
    </>
  );
}
