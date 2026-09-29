import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnumBadge } from "@/components/shared/status-badge";
import { DocumentHeader, DocumentPaper, PartyBlock } from "@/components/portal/document";
import { PrintButton } from "@/components/portal/print-button";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { loadOr404 } from "@/lib/page-helpers";
import { getPortalInvoice } from "@/services/portal/billing-service";
import { chargeTypeLabels, invoiceStatusLabels, invoiceStatusTones, paymentMethodLabels } from "@/config/labels";
import { paymentProviderLabels } from "@/config/payment-labels";
import { spEnum } from "@/lib/page-helpers";
import { PAYMENT_RESULT_PARAMS } from "@/lib/validation/payments";
import { PayOnlineButton } from "@/components/payments/pay-online-button";
import { PaymentResultBanner } from "@/components/payments/payment-result-banner";
import { OnlineAttemptsList } from "@/components/payments/online-attempts-list";
import { listAvailableGateways, listPortalInvoiceOnlinePayments } from "@/services/payments/online-payment-service";

export const metadata = { title: "Invoice" };

const PAYABLE = new Set(["PENDING", "PARTIALLY_PAID", "OVERDUE"]);

export default async function PortalInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireResidentPage();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const inv = await loadOr404(getPortalInvoice(ctx, id));
  const [gateways, attempts] = await Promise.all([listAvailableGateways(ctx.organizationId), listPortalInvoiceOnlinePayments(ctx, inv.id)]);
  const fmt = portalFormatters(ctx);
  const taxLabel = inv.organization.taxLabel || "Tax";
  const paymentResult = spEnum(query, "payment", PAYMENT_RESULT_PARAMS);
  const hasPending = attempts.some((a) => a.status === "PENDING");
  // The ?payment= param is only a hint for the banner; balances and receipts always come from the database.
  const canPayOnline = PAYABLE.has(inv.status) && inv.balance > 0 && gateways.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal/invoices">
            <ArrowLeft className="rtl:rotate-180" />
            Invoices
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {canPayOnline ? <PayOnlineButton invoiceId={inv.id} amountLabel={fmt.money(inv.balance)} gateways={gateways} size="sm" /> : null}
          <PrintButton />
        </div>
      </div>

      {paymentResult ? <PaymentResultBanner result={paymentResult === "success" && inv.balance > 0 && hasPending ? "pending" : paymentResult} /> : null}

      {canPayOnline && !paymentResult ? (
        <div className="no-print flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {fmt.money(inv.balance)} due {inv.status === "OVERDUE" ? "(overdue)" : `by ${fmt.date(inv.dueDate)}`}
            </p>
            <p className="text-xs text-muted-foreground">Pay securely with {gateways.map((g) => paymentProviderLabels[g.provider]).join(" or ")}.</p>
          </div>
          <PayOnlineButton invoiceId={inv.id} amountLabel={fmt.money(inv.balance)} gateways={gateways} label="Pay now" />
        </div>
      ) : null}

      <DocumentPaper>
        <DocumentHeader org={inv.organization} title="Invoice" number={inv.invoiceNumber}>
          <div className="mt-1 sm:flex sm:justify-end">
            <EnumBadge value={inv.status} labels={invoiceStatusLabels} tones={invoiceStatusTones} />
          </div>
        </DocumentHeader>

        <div className="grid gap-4 border-b py-5 sm:grid-cols-3">
          <PartyBlock
            label="Billed to"
            lines={[`${inv.resident.firstName} ${inv.resident.lastName}`, inv.resident.residentCode, inv.resident.phone, inv.resident.email]}
          />
          <PartyBlock label="Hostel" lines={[inv.hostel.name, [inv.hostel.address, inv.hostel.city].filter(Boolean).join(", "), inv.hostel.phone]} />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-1 sm:text-end">
            <div>
              <dt className="text-xs text-muted-foreground">Issued</dt>
              <dd className="font-medium">{fmt.date(inv.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Due</dt>
              <dd className="font-medium">{fmt.date(inv.dueDate)}</dd>
            </div>
            {inv.periodStart && inv.periodEnd ? (
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-xs text-muted-foreground">Billing period</dt>
                <dd className="font-medium">
                  {fmt.date(inv.periodStart)} – {fmt.date(inv.periodEnd)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2.5 text-start font-medium">Description</th>
                <th className="hidden py-2.5 text-end font-medium sm:table-cell">Qty</th>
                <th className="hidden py-2.5 text-end font-medium sm:table-cell">Unit price</th>
                <th className="py-2.5 text-end font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((item) => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="py-2.5 pe-3">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {chargeTypeLabels[item.type]}
                      <span className="sm:hidden">
                        {" · "}
                        {item.quantity} × {fmt.money(item.unitPrice)}
                      </span>
                    </p>
                  </td>
                  <td className="hidden py-2.5 text-end tabular sm:table-cell">{item.quantity}</td>
                  <td className="hidden py-2.5 text-end tabular sm:table-cell">{fmt.money(item.unitPrice)}</td>
                  <td className="py-2.5 text-end font-medium tabular">{fmt.money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end border-t pt-4">
          <dl className="grid w-full max-w-xs gap-1.5 text-sm">
            <Row label="Subtotal" value={fmt.money(inv.subtotal)} />
            {inv.discount > 0 ? <Row label="Discount" value={`− ${fmt.money(inv.discount)}`} /> : null}
            {inv.tax > 0 ? <Row label={`${taxLabel} (${inv.taxRate}%)`} value={fmt.money(inv.tax)} /> : null}
            <Row label="Total" value={fmt.money(inv.total)} strong />
            <Row label="Paid" value={fmt.money(inv.amountPaid)} />
            {inv.status !== "CANCELLED" ? (
              <div className="mt-1 flex items-center justify-between rounded-lg bg-muted px-3 py-2">
                <dt className="font-semibold">Balance due</dt>
                <dd className={inv.balance > 0 ? "font-semibold text-danger tabular" : "font-semibold text-success tabular"}>
                  {fmt.money(Math.max(inv.balance, 0))}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {inv.status === "CANCELLED" ? (
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            This invoice was cancelled{inv.cancelledAt ? ` on ${fmt.date(inv.cancelledAt)}` : ""}
            {inv.cancelReason ? `: ${inv.cancelReason}` : "."} Nothing is owed on it.
          </p>
        ) : null}

        {inv.payments.length ? (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Payments received</h3>
            <ul className="divide-y rounded-lg border text-sm">
              {inv.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <Link href={`/portal/payments/${p.id}`} className="font-mono text-xs hover:text-primary">
                    {p.receiptNumber}
                  </Link>
                  <span className="flex-1 text-xs text-muted-foreground">
                    {fmt.date(p.paymentDate)} ·{" "}
                    {p.onlinePayment ? `Online (${paymentProviderLabels[p.onlinePayment.provider]})` : paymentMethodLabels[p.method]}
                  </span>
                  <span className="font-medium tabular">{fmt.money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {inv.notes ? <p className="mt-6 text-sm whitespace-pre-line text-muted-foreground">{inv.notes}</p> : null}
        {inv.organization.invoiceFooter ? (
          <p className="mt-6 border-t pt-4 text-center text-xs whitespace-pre-line text-muted-foreground">{inv.organization.invoiceFooter}</p>
        ) : null}
      </DocumentPaper>

      <OnlineAttemptsList
        attempts={attempts}
        money={fmt.money}
        dateTime={fmt.dateTime}
        receiptHref={(paymentId) => `/portal/payments/${paymentId}`}
      />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-semibold tabular" : "tabular"}>{value}</dd>
    </div>
  );
}
