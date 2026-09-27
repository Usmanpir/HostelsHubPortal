import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Plus, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { PaymentsTable } from "@/components/finance/payments-table";
import { RefundDialog } from "@/components/finance/refund-dialog";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { formatMoney, todayInTimeZone } from "@/lib/format";
import { getPaymentTotals, listPayments } from "@/services/finance/payment-service";
import { parsePaymentFilters } from "@/services/finance/filters";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { optionsFrom, paymentMethodLabels, paymentStatusLabels, paymentTypeLabels } from "@/config/labels";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/finance/payments">) {
  const ctx = await requireTenantPage("payments.view");
  const params = await searchParams;
  const filters = parsePaymentFilters(params);
  const [data, totals, hostels] = await Promise.all([listPayments(ctx, filters), getPaymentTotals(ctx, filters), listHostelOptions(ctx)]);
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
      <PaymentsTable data={data} filters={tableFilters} hasActiveFilters={hasActiveFilters} emptyAction={canManage ? recordButton : undefined} />
    </>
  );
}
