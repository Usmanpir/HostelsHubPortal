import Link from "next/link";
import { Ban, CircleDollarSign, Pencil, Send, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EnumBadge } from "@/components/shared/status-badge";
import { InvoiceDocument } from "@/components/finance/invoice-document";
import { PrintButton, PrintStyles } from "@/components/finance/print-button";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { getInvoice } from "@/services/finance/invoice-service";
import { invoiceStatusLabels, invoiceStatusTones, paymentMethodLabels, paymentStatusLabels, paymentStatusTones } from "@/config/labels";
import { applyCreditAction, cancelInvoiceAction, issueInvoiceAction } from "../../actions";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({ params }: PageProps<"/finance/invoices/[id]">) {
  const ctx = await requireTenantPage("invoices.view");
  const { id } = await params;
  const invoice = await loadOr404(getInvoice(ctx, id));
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const canManageInvoices = can(ctx, "invoices.manage");
  const canManagePayments = can(ctx, "payments.manage");
  const canViewPayments = can(ctx, "payments.view");
  const receivable = invoice.status === "PENDING" || invoice.status === "PARTIALLY_PAID" || invoice.status === "OVERDUE";
  const residentName = `${invoice.resident.firstName} ${invoice.resident.lastName}`.trim();
  const creditToApply = Math.min(invoice.residentCredit, invoice.balance);

  return (
    <>
      <PrintStyles />
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{invoice.invoiceNumber}</span>
            <EnumBadge value={invoice.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
          </span>
        }
        description={`${residentName} · ${invoice.hostel.name}`}
        breadcrumbs={[{ label: "Invoices", href: "/finance/invoices" }, { label: invoice.invoiceNumber }]}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            {canManagePayments && receivable ? (
              <Button asChild>
                <Link href={`/finance/payments/new?invoiceId=${invoice.id}`}>
                  <CircleDollarSign />
                  Record payment
                </Link>
              </Button>
            ) : null}
            {canManagePayments && receivable && creditToApply > 0 ? (
              <ConfirmAction
                trigger={
                  <Button variant="outline">
                    <Sparkles />
                    Apply credit
                  </Button>
                }
                title={`Apply ${money(creditToApply)} credit?`}
                description={`${residentName} has ${money(invoice.residentCredit)} in advance credit. ${money(creditToApply)} will be applied to this invoice.`}
                confirmLabel="Apply credit"
                action={applyCreditAction.bind(null, invoice.id)}
              />
            ) : null}
            {canManageInvoices && invoice.status === "DRAFT" ? (
              <ConfirmAction
                trigger={
                  <Button>
                    <Send />
                    Issue invoice
                  </Button>
                }
                title="Issue this invoice?"
                description="The resident will be notified and the invoice will count towards their balance."
                confirmLabel="Issue"
                action={issueInvoiceAction.bind(null, invoice.id)}
              />
            ) : null}
            {canManageInvoices && invoice.canEdit ? (
              <Button asChild variant="outline">
                <Link href={`/finance/invoices/${invoice.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            ) : null}
            <PrintButton />
            {canManageInvoices && invoice.status !== "CANCELLED" && invoice.amountPaid === 0 ? (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" className="text-destructive">
                    <Ban />
                    Cancel
                  </Button>
                }
                title={`Cancel ${invoice.invoiceNumber}?`}
                description="Cancelled invoices stay on record but no longer count towards the resident's balance. This can't be undone."
                confirmLabel="Cancel invoice"
                destructive
                reason={{ label: "Reason", required: true, placeholder: "e.g. Issued in error, duplicate" }}
                action={cancelInvoiceAction.bind(null, invoice.id)}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InvoiceDocument invoice={invoice} />
        </div>

        <aside className="no-print flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Summary</h2>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="tabular">{money(invoice.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular">{money(invoice.amountPaid)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <dt>Balance</dt>
                <dd className="tabular">{money(invoice.balance)}</dd>
              </div>
              {invoice.residentCredit > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>Resident credit</dt>
                  <dd className="tabular">{money(invoice.residentCredit)}</dd>
                </div>
              ) : null}
            </dl>
            {can(ctx, "residents.view") ? (
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link href={`/residents/${invoice.resident.id}`}>
                  <UserRound />
                  View resident
                </Link>
              </Button>
            ) : null}
          </section>

          {invoice.status === "CANCELLED" ? (
            <section className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
              <h2 className="mb-1 font-semibold text-danger">Cancelled</h2>
              <p className="text-muted-foreground">{formatDateTime(invoice.cancelledAt, ctx.organization.timezone, ctx.organization.locale)}</p>
              {invoice.cancelReason ? <p className="mt-2">{invoice.cancelReason}</p> : null}
            </section>
          ) : null}

          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Payments</h2>
              <span className="text-xs text-muted-foreground">{invoice.payments.length}</span>
            </header>
            {invoice.payments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {invoice.payments.map((p) => {
                  const body = (
                    <div className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-medium">{p.receiptNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(p.paymentDate, ctx.organization.locale)} · {paymentMethodLabels[p.method]}
                          {p.receivedBy ? ` · ${p.receivedBy.name}` : ""}
                        </p>
                        {p.status === "VOIDED" && p.voidReason ? <p className="mt-1 text-xs text-danger">Voided: {p.voidReason}</p> : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={p.status === "VOIDED" ? "tabular text-sm text-muted-foreground line-through" : "tabular text-sm font-medium"}>
                          {money(p.amount)}
                        </span>
                        <EnumBadge value={p.status} labels={paymentStatusLabels} tones={paymentStatusTones} />
                      </div>
                    </div>
                  );
                  return (
                    <li key={p.id}>
                      {canViewPayments ? (
                        <Link href={`/finance/payments/${p.id}`} className="block hover:bg-accent/40">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="px-1 text-xs text-muted-foreground">
            Created {formatDateTime(invoice.createdAt, ctx.organization.timezone, ctx.organization.locale)}
            {invoice.createdBy ? ` by ${invoice.createdBy.name}` : ""}
          </p>
        </aside>
      </div>
    </>
  );
}
