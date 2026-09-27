import { EnumBadge } from "@/components/shared/status-badge";
import { chargeTypeLabels, invoiceStatusLabels, invoiceStatusTones } from "@/config/labels";
import { formatDate, formatMoney } from "@/lib/format";
import type { InvoiceDetail } from "@/services/finance/invoice-service";
import { cn } from "@/lib/utils";

/** Printable, branded invoice. Server component — rendered inside `.finance-print-area`. */
export function InvoiceDocument({ invoice, className }: { invoice: InvoiceDetail; className?: string }) {
  const org = invoice.organization;
  const money = (n: number) => formatMoney(n, org.currency, org.locale);
  const date = (d: Date | string | null) => formatDate(d, org.locale);
  const residentName = `${invoice.resident.firstName} ${invoice.resident.lastName}`.trim();
  const stay = invoice.assignment ? `Room ${invoice.assignment.room.roomNumber} · Bed ${invoice.assignment.bed.bedNumber}` : null;

  return (
    <article className={cn("finance-print-area relative overflow-hidden rounded-xl border bg-card p-5 sm:p-8", className)}>
      {invoice.status === "CANCELLED" || invoice.status === "PAID" || invoice.status === "DRAFT" ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute end-6 top-24 rotate-[-12deg] rounded-md border-2 px-3 py-1 text-lg font-bold tracking-widest uppercase opacity-25 select-none sm:top-28",
            invoice.status === "PAID" ? "border-success text-success" : invoice.status === "CANCELLED" ? "border-danger text-danger" : "border-muted-foreground text-muted-foreground",
          )}
        >
          {invoiceStatusLabels[invoice.status]}
        </span>
      ) : null}

      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file route
            <img src={org.logoUrl} alt="" className="size-12 rounded-lg object-contain" />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
              {org.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="text-sm">
            <p className="text-base font-semibold">{org.name}</p>
            {org.address ? <p className="print-muted text-muted-foreground">{org.address}</p> : null}
            <p className="print-muted text-muted-foreground">{[org.phone, org.email].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="sm:text-end">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Invoice</p>
          <p className="font-mono text-lg font-semibold">{invoice.invoiceNumber}</p>
          <div className="mt-1 sm:flex sm:justify-end">
            <EnumBadge value={invoice.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Billed to</p>
          <p className="font-medium">{residentName}</p>
          <p className="print-muted font-mono text-xs text-muted-foreground">{invoice.resident.residentCode}</p>
          <p className="print-muted text-muted-foreground">{invoice.hostel.name}{stay ? ` · ${stay}` : ""}</p>
          {invoice.resident.phone ? <p className="print-muted text-muted-foreground">{invoice.resident.phone}</p> : null}
          {invoice.resident.email ? <p className="print-muted text-muted-foreground">{invoice.resident.email}</p> : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:text-end">
          <dt className="text-muted-foreground">Issue date</dt>
          <dd>{date(invoice.issueDate)}</dd>
          <dt className="text-muted-foreground">Due date</dt>
          <dd className={cn(invoice.status === "OVERDUE" && "font-medium text-danger")}>{date(invoice.dueDate)}</dd>
          {invoice.periodStart ? (
            <>
              <dt className="text-muted-foreground">Billing period</dt>
              <dd>
                {date(invoice.periodStart)}
                {invoice.periodEnd ? ` – ${date(invoice.periodEnd)}` : ""}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 pe-3 text-start font-medium">Description</th>
              <th className="px-3 py-2 text-end font-medium">Qty</th>
              <th className="px-3 py-2 text-end font-medium">Unit price</th>
              <th className="py-2 ps-3 text-end font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b last:border-b-0">
                <td className="py-2.5 pe-3">
                  <p>{item.description}</p>
                  {item.description !== chargeTypeLabels[item.type] ? (
                    <p className="print-muted text-xs text-muted-foreground">{chargeTypeLabels[item.type]}</p>
                  ) : null}
                </td>
                <td className="tabular px-3 py-2.5 text-end">{item.quantity}</td>
                <td className="tabular px-3 py-2.5 text-end">{money(item.unitPrice)}</td>
                <td className="tabular py-2.5 ps-3 text-end">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-6 flex justify-end">
        <dl className="grid w-full max-w-xs grid-cols-2 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular text-end">{money(invoice.subtotal)}</dd>
          {invoice.discount > 0 ? (
            <>
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular text-end">− {money(invoice.discount)}</dd>
            </>
          ) : null}
          {invoice.tax > 0 ? (
            <>
              <dt className="text-muted-foreground">
                {org.taxLabel} ({invoice.taxRate}%)
              </dt>
              <dd className="tabular text-end">{money(invoice.tax)}</dd>
            </>
          ) : null}
          <dt className="mt-1 border-t pt-2 font-semibold">Total</dt>
          <dd className="tabular mt-1 border-t pt-2 text-end font-semibold">{money(invoice.total)}</dd>
          {invoice.amountPaid > 0 ? (
            <>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="tabular text-end">− {money(invoice.amountPaid)}</dd>
            </>
          ) : null}
          {invoice.status !== "CANCELLED" && invoice.status !== "DRAFT" ? (
            <>
              <dt className="font-semibold">Balance due</dt>
              <dd className="tabular text-end text-base font-semibold">{money(invoice.balance)}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {invoice.notes ? (
        <section className="mt-8 text-sm">
          <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Notes</p>
          <p className="whitespace-pre-line">{invoice.notes}</p>
        </section>
      ) : null}

      {org.invoiceFooter ? (
        <footer className="print-muted mt-8 border-t pt-4 text-center text-xs whitespace-pre-line text-muted-foreground">{org.invoiceFooter}</footer>
      ) : null}
    </article>
  );
}
