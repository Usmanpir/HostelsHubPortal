import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Plus, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { PaymentsTable } from "@/components/finance/payments-table";
import { RefundDialog } from "@/components/finance/refund-dialog";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { formatDateTime, formatMoney, todayInTimeZone } from "@/lib/format";
import { getPaymentTotals, listPayments } from "@/services/finance/payment-service";
import { parsePaymentFilters } from "@/services/finance/filters";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { optionsFrom, paymentMethodLabels, paymentStatusLabels, paymentTypeLabels } from "@/config/labels";
import { onlinePaymentStatusLabels } from "@/config/payment-labels";
import { sp, spEnum } from "@/lib/page-helpers";
import { cn } from "@/lib/utils";
import { StaffOnlinePayments } from "@/components/payments/staff-online-payments";
import { countOnlinePaymentsByStatus, listRecentOnlinePayments } from "@/services/payments/online-payment-service";
import type { OnlinePaymentStatus } from "@/generated/prisma/enums";

const ONLINE_STATUSES = Object.keys(onlinePaymentStatusLabels) as OnlinePaymentStatus[];

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/finance/payments">) {
  const ctx = await requireTenantPage("payments.view");
  const params = await searchParams;
  const filters = parsePaymentFilters(params);
  const tab = sp(params, "tab") === "online" ? "online" : "all";
  const onlineStatus = spEnum(params, "onlineStatus", ONLINE_STATUSES);
  const [data, totals, hostels, onlineCounts, onlineRows] = await Promise.all([
    listPayments(ctx, filters),
    getPaymentTotals(ctx, filters),
    listHostelOptions(ctx),
    countOnlinePaymentsByStatus(ctx),
    tab === "online" ? listRecentOnlinePayments(ctx, { status: onlineStatus, take: 100 }) : Promise.resolve([]),
  ]);
  const onlineTotal = Object.values(onlineCounts).reduce((sum, n) => sum + (n ?? 0), 0);
  const canManage = can(ctx, "payments.manage");
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const today = todayInTimeZone(ctx.organization.timezone);
  const hasActiveFilters = !!(filters.q || filters.method || filters.type || filters.status || filters.from || filters.to || filters.hostelId || filters.residentId || filters.invoiceId);
  const scopeLabel = filters.from || filters.to ? "In selected dates" : "All time";

  const tableFilters = [
    { key: "method", label: "Methods", options: optionsFrom(paymentMethodLabels) },
    { key: "type", label: "Types", options: optionsFrom(paymentTypeLabels) },
    { key: "status", label: "Statuses", options: optionsFrom(paymentStatusLabels) },
    ...(!ctx.activeHostelId && hostels.length > 1
      ? [{ key: "hostel", label: "Hostels", options: hostels.map((h) => ({ value: h.id, label: h.name })) }]
      : []),
  ];

  const recordButton = (
    <Button asChild>
      <Link href="/finance/payments/new">
        <Plus />
        Record payment
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received from and refunded to residents, with printable receipts."
        breadcrumbs={[{ label: "Finance", href: can(ctx, "reports.financial") ? "/finance" : undefined }, { label: "Payments" }]}
        actions={
          canManage ? (
            <>
              <RefundDialog
                today={today}
                trigger={
                  <Button variant="outline">
                    <Undo2 />
                    Record refund
                  </Button>
                }
              />
              {recordButton}
            </>
          ) : null
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Received" value={money(totals.received)} hint={scopeLabel} icon={ArrowDownLeft} tone="success" />
        <StatCard label="Refunded" value={money(totals.refunds)} hint={scopeLabel} icon={ArrowUpRight} tone="warning" />
        <StatCard label="Net collected" value={money(totals.net)} hint="Received − refunds" icon={Wallet} tone="info" />
        <StatCard label="Transactions" value={totals.count} hint="Completed, matching filters" />
      </div>
      {onlineTotal > 0 || tab === "online" ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Payment views">
            {(
              [
                ["all", "All payments", "/finance/payments"],
                ["online", `Online attempts (${onlineTotal})`, "/finance/payments?tab=online"],
              ] as const
            ).map(([key, label, href]) => (
              <Link
                key={key}
                href={href}
                role="tab"
                aria-selected={tab === key}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                  tab === key ? "bg-primary text-primary-foreground" : "hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          {tab === "online" ? (
            <div className="flex flex-wrap gap-1">
              {[undefined, ...ONLINE_STATUSES].map((st) => (
                <Link
                  key={st ?? "any"}
                  href={st ? `/finance/payments?tab=online&onlineStatus=${st}` : "/finance/payments?tab=online"}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    onlineStatus === st ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {st ? `${onlinePaymentStatusLabels[st]} (${onlineCounts[st] ?? 0})` : "Any status"}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === "online" ? (
        <StaffOnlinePayments
          rows={onlineRows}
          money={money}
          dateTime={(d) => formatDateTime(d, ctx.organization.timezone, ctx.organization.locale)}
          canViewInvoices={can(ctx, "invoices.view")}
          canViewResidents={can(ctx, "residents.view")}
          filtered={!!onlineStatus}
        />
      ) : (
        <PaymentsTable data={data} filters={tableFilters} hasActiveFilters={hasActiveFilters} emptyAction={canManage ? recordButton : undefined} />
      )}
    </>
  );
}
