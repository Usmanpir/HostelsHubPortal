import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge } from "@/components/shared/status-badge";
import { ListPagination } from "@/components/portal/list-pagination";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { spEnum, spNumber } from "@/lib/page-helpers";
import { getPortalBalance, listPortalInvoices } from "@/services/portal/billing-service";
import { PORTAL_INVOICE_FILTERS, type PortalInvoiceFilter } from "@/lib/validation/portal";
import { invoiceStatusLabels, invoiceStatusTones } from "@/config/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invoices" };

const FILTER_LABELS: Record<PortalInvoiceFilter, string> = { all: "All", unpaid: "Unpaid", paid: "Paid" };

export default async function PortalInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireResidentPage();
  const params = await searchParams;
  const filter = spEnum(params, "status", PORTAL_INVOICE_FILTERS) ?? "all";
  const [data, balance] = await Promise.all([
    listPortalInvoices(ctx, filter, { page: spNumber(params, "page", 1) }),
    getPortalBalance(ctx),
  ]);
  const fmt = portalFormatters(ctx);

  return (
    <>
      <PageHeader
        title="Invoices"
        description={
          balance.outstanding > 0 ? (
            <>
              Outstanding: <span className="font-semibold text-danger tabular">{fmt.money(balance.outstanding)}</span>
              {balance.credit > 0 ? <> · Credit: <span className="tabular">{fmt.money(balance.credit)}</span></> : null}
            </>
          ) : (
            "All your bills from the hostel."
          )
        }
      />

      <div className="mb-4 inline-flex rounded-lg border bg-card p-0.5" role="tablist" aria-label="Filter invoices">
        {PORTAL_INVOICE_FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/portal/invoices" : `/portal/invoices?status=${f}`}
            role="tab"
            aria-selected={filter === f}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
              filter === f ? "bg-primary text-primary-foreground" : "hover:text-foreground",
            )}
          >
            {FILTER_LABELS[f]}
          </Link>
        ))}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filter === "unpaid" ? "Nothing to pay" : filter === "paid" ? "No paid invoices yet" : "No invoices yet"}
          description={filter === "unpaid" ? "You're all caught up." : "Invoices from the hostel will appear here."}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((inv) => (
            <li key={inv.id}>
              <Link
                href={`/portal/invoices/${inv.id}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 active:bg-accent/40"
              >
                <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-muted sm:flex">
                  <FileText className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{inv.invoiceNumber}</span>
                    <EnumBadge value={inv.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {inv.periodStart && inv.periodEnd
                      ? `${fmt.date(inv.periodStart)} – ${fmt.date(inv.periodEnd)}`
                      : `Issued ${fmt.date(inv.issueDate)}`}
                    {" · "}Due {fmt.date(inv.dueDate)}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-sm font-semibold tabular">{fmt.money(inv.total)}</p>
                  {inv.balance > 0 && inv.status !== "CANCELLED" ? (
                    <p className="text-xs text-danger tabular">{fmt.money(inv.balance)} due</p>
                  ) : null}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ListPagination
        basePath="/portal/invoices"
        page={data.page}
        pageCount={data.pageCount}
        total={data.total}
        params={{ status: filter === "all" ? undefined : filter }}
      />
    </>
  );
}
