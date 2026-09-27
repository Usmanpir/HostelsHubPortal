import Link from "next/link";
import { ChevronRight, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ListPagination } from "@/components/portal/list-pagination";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { spNumber } from "@/lib/page-helpers";
import { listPortalPayments } from "@/services/portal/billing-service";
import { paymentMethodLabels } from "@/config/labels";
import { paymentKindLabel } from "@/components/portal/payment-kind";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payments" };

export default async function PortalPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireResidentPage();
  const params = await searchParams;
  const data = await listPortalPayments(ctx, { page: spNumber(params, "page", 1) });
  const fmt = portalFormatters(ctx);

  return (
    <>
      <PageHeader title="Payments" description="Receipts for everything you've paid." />
      {data.items.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" description="When the office records a payment from you, its receipt appears here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((p) => {
            const voided = p.status === "VOIDED";
            const kind = paymentKindLabel(p.type, p.amount);
            return (
              <li key={p.id}>
                <Link
                  href={`/portal/payments/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 active:bg-accent/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{p.receiptNumber}</span>
                      {voided ? <StatusBadge tone="neutral">Voided</StatusBadge> : null}
                      {kind ? <StatusBadge tone={kind.tone}>{kind.label}</StatusBadge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {fmt.date(p.paymentDate)} · {paymentMethodLabels[p.method]}
                      {p.invoice ? ` · ${p.invoice.invoiceNumber}` : ""}
                    </p>
                  </div>
                  <span className={cn("text-sm font-semibold tabular", voided && "text-muted-foreground line-through")}>
                    {fmt.money(Math.abs(p.amount))}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ListPagination basePath="/portal/payments" page={data.page} pageCount={data.pageCount} total={data.total} />
    </>
  );
}
