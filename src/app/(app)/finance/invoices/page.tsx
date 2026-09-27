import Link from "next/link";
import { AlertTriangle, CalendarClock, FilePen, FileText, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { InvoicesTable } from "@/components/finance/invoices-table";
import { GenerateInvoicesDialog } from "@/components/finance/generate-invoices-dialog";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { formatMoney, todayInTimeZone } from "@/lib/format";
import { getInvoiceFormDefaults, getInvoiceStats, listInvoices } from "@/services/finance/invoice-service";
import { parseInvoiceFilters } from "@/services/finance/filters";
import { listHostelOptions } from "@/services/hostel/hostel-service";
import { invoiceStatusLabels, optionsFrom } from "@/config/labels";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: PageProps<"/finance/invoices">) {
  const ctx = await requireTenantPage("invoices.view");
  const params = await searchParams;
  const filters = parseInvoiceFilters(params);
  const canManage = can(ctx, "invoices.manage");
  const [data, stats, hostels, defaults] = await Promise.all([
    listInvoices(ctx, filters),
    getInvoiceStats(ctx, filters.hostelId),
    listHostelOptions(ctx),
    canManage ? getInvoiceFormDefaults(ctx) : Promise.resolve(null),
  ]);
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const hasActiveFilters = !!(filters.q || filters.status || filters.from || filters.to || filters.hostelId || filters.residentId);
  const scopedHostels = ctx.activeHostelId ? hostels.filter((h) => h.id === ctx.activeHostelId) : hostels;

  const tableFilters = [
    {
      key: "status",
      label: "Status",
      options: [{ value: "RECEIVABLE", label: "Unpaid (any)" }, ...optionsFrom(invoiceStatusLabels)],
    },
    ...(!ctx.activeHostelId && hostels.length > 1
      ? [{ key: "hostel", label: "Hostels", options: hostels.map((h) => ({ value: h.id, label: h.name })) }]
      : []),
  ];

  const newInvoice = (
    <Button asChild>
      <Link href="/finance/invoices/new">
        <Plus />
        New invoice
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Bills issued to residents, with payment status and balances."
        breadcrumbs={[{ label: "Finance", href: can(ctx, "reports.financial") ? "/finance" : undefined }, { label: "Invoices" }]}
        actions={
          canManage && defaults ? (
            <>
              <GenerateInvoicesDialog
                hostels={scopedHostels.map((h) => ({ id: h.id, name: h.name }))}
                defaultHostelId={ctx.activeHostelId}
                currentMonth={todayInTimeZone(ctx.organization.timezone).slice(0, 7)}
                taxRate={defaults.taxRate}
                taxLabel={defaults.taxLabel}
                trigger={
                  <Button variant="outline">
                    <CalendarClock />
                    Generate monthly rent
                  </Button>
                }
              />
              {newInvoice}
            </>
          ) : null
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Outstanding" value={money(stats.outstanding)} hint={`${stats.outstandingCount} unpaid invoice${stats.outstandingCount === 1 ? "" : "s"}`} icon={Wallet} tone="info" href="/finance/invoices?status=RECEIVABLE" />
        <StatCard label="Overdue" value={money(stats.overdue)} hint={`${stats.overdueCount} past due`} icon={AlertTriangle} tone={stats.overdueCount ? "danger" : "default"} href="/finance/invoices?status=OVERDUE" />
        <StatCard label="Drafts" value={stats.draftCount} hint="Not yet sent to residents" icon={FilePen} href="/finance/invoices?status=DRAFT" />
        <StatCard label="Paid invoices" value={stats.paidCount} icon={FileText} tone="success" href="/finance/invoices?status=PAID" />
      </div>
      <InvoicesTable data={data} filters={tableFilters} hasActiveFilters={hasActiveFilters} emptyAction={canManage ? newInvoice : undefined} />
    </>
  );
}
