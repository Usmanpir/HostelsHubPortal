import Link from "next/link";
import { BedDouble, CalendarClock, CalendarX, History, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ExportMenu } from "@/components/data-table/export-menu";
import { AssignmentsTable } from "@/components/residents/assignments-table";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { todayInTimeZone } from "@/lib/format";
import { can } from "@/lib/tenant/context";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { getAssignmentStats, listAssignments } from "@/services/resident/assignment-service";
import { parseAssignmentFilters } from "@/services/resident/filters";
import { assignmentStatusLabels, optionsFrom } from "@/config/labels";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: termsFor(ctx?.organization.businessType).stays };
}

export default async function AssignmentsPage({ searchParams }: PageProps<"/residents/assignments">) {
  const ctx = await requireTenantPage("residents.view");
  const params = await searchParams;
  const filters = parseAssignmentFilters(params);
  const [data, stats, hostels] = await Promise.all([listAssignments(ctx, filters), getAssignmentStats(ctx), listHostelOptions(ctx, { includeArchived: true })]);
  const showHostel = !ctx.activeHostelId && hostels.length > 1;
  const filtered = !!(filters.q || filters.status || filters.from || filters.to || filters.hostelId || filters.expiring);
  const t = termsFor(ctx.organization.businessType);
  const hostelOrg = ctx.organization.businessType === "HOSTELS";
  const stays = t.stays.toLowerCase();
  const showLease = !hostelOrg || stats.expiringSoon > 0 || data.items.some((a) => a.leaseEndDate);

  return (
    <>
      <PageHeader
        title={t.stays}
        description={
          hostelOrg
            ? "Complete history of check-ins, reservations, transfers and check-outs."
            : "Every lease — current, upcoming and ended — with lease end dates and renewals."
        }
        breadcrumbs={[{ label: t.residents, href: "/residents" }, { label: t.stays }]}
        actions={
          can(ctx, "assignments.manage") ? (
            <Button asChild>
              <Link href="/residents/check-in">
                <LogIn />
                {t.checkIn}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs group="checkInOut" />
      <div className={showLease ? "mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5" : "mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"}>
        <StatCard label={`Active ${stays}`} value={stats.active} icon={BedDouble} tone="success" href="/residents/assignments?status=ACTIVE" />
        <StatCard label="Reservations" value={stats.reserved} icon={CalendarClock} tone="info" href="/residents/assignments?status=RESERVED" />
        <StatCard label={hostelOrg ? "Check-ins this month" : "Move-ins this month"} value={stats.checkInsThisMonth} icon={LogIn} />
        <StatCard
          label={hostelOrg ? "Check-outs this month" : "Move-outs this month"}
          value={stats.checkOutsThisMonth}
          icon={LogOut}
          href="/residents/assignments?status=COMPLETED"
        />
        {showLease ? (
          <StatCard
            label="Expiring in 30 days"
            value={stats.expiringSoon}
            icon={CalendarX}
            tone={stats.expiringSoon > 0 ? "warning" : undefined}
            href="/residents/assignments?lease=expiring"
          />
        ) : null}
      </div>
      <AssignmentsTable
        data={data}
        showHostel={showHostel}
        showLease={showLease}
        today={todayInTimeZone(ctx.organization.timezone)}
        toolbar={<ExportMenu endpoint="/api/assignments/export" />}
        filters={[
          { key: "status", label: "Status", options: optionsFrom(assignmentStatusLabels) },
          ...(showLease ? [{ key: "lease", label: "Lease", options: [{ value: "expiring", label: "Expiring in 30 days" }] }] : []),
          ...(showHostel ? [{ key: "hostelId", label: t.property, options: hostels.map((h) => ({ value: h.id, label: h.name })) }] : []),
        ]}
        empty={
          <EmptyState
            icon={History}
            title={filtered ? `No ${stays} match your filters` : `No ${stays} yet`}
            description={
              filtered
                ? "Try a different search or date range."
                : `${t.stays} appear here as ${t.residents.toLowerCase()} are ${t.checkedIn.toLowerCase()}.`
            }
          />
        }
      />
    </>
  );
}
