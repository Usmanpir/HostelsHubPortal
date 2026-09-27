import { EnumBadge } from "@/components/shared/status-badge";
import { paymentMethodLabels, paymentStatusLabels, paymentStatusTones, paymentTypeLabels } from "@/config/labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import type { PaymentDetail } from "@/services/finance/payment-service";
import { cn } from "@/lib/utils";
import { amountInWords } from "./amount-in-words";

const TITLES = { PAYMENT: "Payment receipt", ADVANCE: "Advance receipt", REFUND: "Refund voucher" } as const;

/** Printable, branded receipt. Server component rendered inside `.finance-print-area`. */
export function ReceiptDocument({ payment, timezone }: { payment: PaymentDetail; timezone: string }) {
  const org = payment.organization;
  const money = (n: number) => formatMoney(n, org.currency, org.locale);
  const residentName = `${payment.resident.firstName} ${payment.resident.lastName}`.trim();
  const title = payment.isCreditEntry ? "Credit applied" : TITLES[payment.type];
  const amount = Math.abs(payment.amount);

  const rows: [string, React.ReactNode][] = [
    [payment.type === "REFUND" ? "Paid to" : "Received from", <span key="r" className="font-medium">{residentName}</span>],
    ["Resident code", <span key="c" className="font-mono text-xs">{payment.resident.residentCode}</span>],
    ["Hostel", payment.hostel.name],
    ...(payment.invoice ? ([["Invoice", <span key="i" className="font-mono text-xs">{payment.invoice.invoiceNumber}</span>]] as [string, React.ReactNode][]) : []),
    ["Type", paymentTypeLabels[payment.type]],
    ["Method", paymentMethodLabels[payment.method]],
    ...(payment.reference ? ([["Reference", payment.reference]] as [string, React.ReactNode][]) : []),
    ["Date", formatDate(payment.paymentDate, org.locale)],
    [payment.type === "REFUND" ? "Paid by" : "Received by", payment.receivedBy?.name ?? "—"],
  ];

  return (
    <article className="finance-print-area relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl border bg-card p-5 sm:p-8">
      {payment.status === "VOIDED" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute end-6 top-24 rotate-[-12deg] rounded-md border-2 border-danger px-3 py-1 text-lg font-bold tracking-widest text-danger uppercase opacity-30 select-none"
        >
          Void
        </span>
      ) : null}
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
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
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</p>
          <p className="font-mono text-lg font-semibold">{payment.receiptNumber}</p>
          <div className="mt-1 sm:flex sm:justify-end">
            <EnumBadge value={payment.status} labels={paymentStatusLabels} tones={paymentStatusTones} />
          </div>
        </div>
      </header>

      <section className="py-6 text-center">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Amount</p>
        <p className={cn("mt-1 text-4xl font-semibold tracking-tight", payment.status === "VOIDED" && "text-muted-foreground line-through")}>
          {money(amount)}
        </p>
        <p className="print-muted mt-2 text-sm text-muted-foreground italic">
          {amountInWords(amount)} ({org.currency})
        </p>
      </section>

      <dl className="grid gap-x-6 gap-y-3 border-t pt-6 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 sm:flex-col sm:justify-start sm:gap-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-end sm:text-start">{value}</dd>
          </div>
        ))}
      </dl>

      {payment.invoice ? (
        <p className="print-muted mt-6 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Invoice {payment.invoice.invoiceNumber}: total {money(payment.invoice.total)}, paid {money(payment.invoice.amountPaid)}, balance{" "}
          {money(Math.max(0, payment.invoice.total - payment.invoice.amountPaid))}
        </p>
      ) : null}

      {payment.related.length > 0 ? (
        <p className="print-muted mt-3 text-sm text-muted-foreground">
          Excess kept as advance credit:{" "}
          {payment.related.map((r) => `${money(r.amount)} (${r.receiptNumber}${r.status === "VOIDED" ? ", voided" : ""})`).join(", ")}
        </p>
      ) : null}

      {payment.notes ? (
        <section className="mt-6 text-sm">
          <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">Notes</p>
          <p className="whitespace-pre-line">{payment.notes}</p>
        </section>
      ) : null}

      {payment.status === "VOIDED" ? (
        <p className="mt-6 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          Voided {formatDateTime(payment.voidedAt, timezone, org.locale)}
          {payment.voidReason ? ` — ${payment.voidReason}` : ""}
        </p>
      ) : null}

      <footer className="print-muted mt-8 flex flex-col gap-6 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:items-end sm:justify-between">
        <p>
          Issued {formatDateTime(payment.createdAt, timezone, org.locale)}. This is a computer-generated receipt.
          {org.invoiceFooter ? <span className="mt-1 block whitespace-pre-line">{org.invoiceFooter}</span> : null}
        </p>
        <div className="w-44 shrink-0 border-t border-foreground/40 pt-1 text-center">Authorised signature</div>
      </footer>
    </article>
  );
}
