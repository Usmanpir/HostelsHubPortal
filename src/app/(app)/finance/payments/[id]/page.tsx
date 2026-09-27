import Link from "next/link";
import { Ban, FileText, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EnumBadge } from "@/components/shared/status-badge";
import { ReceiptDocument } from "@/components/finance/receipt-document";
import { PrintButton, PrintStyles } from "@/components/finance/print-button";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatMoney } from "@/lib/format";
import { getPayment } from "@/services/finance/payment-service";
import { paymentStatusLabels, paymentStatusTones } from "@/config/labels";
import { voidPaymentAction } from "../../actions";

export const metadata = { title: "Receipt" };

export default async function PaymentDetailPage({ params }: PageProps<"/finance/payments/[id]">) {
  const ctx = await requireTenantPage("payments.view");
  const { id } = await params;
  const payment = await loadOr404(getPayment(ctx, id));
  const residentName = `${payment.resident.firstName} ${payment.resident.lastName}`.trim();
  const money = formatMoney(Math.abs(payment.amount), ctx.organization.currency, ctx.organization.locale);
  const canVoid = can(ctx, "payments.manage") && payment.status === "COMPLETED" && !payment.isCreditEntry;

  return (
    <>
      <PrintStyles />
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{payment.receiptNumber}</span>
            <EnumBadge value={payment.status} labels={paymentStatusLabels} tones={paymentStatusTones} />
          </span>
        }
        description={`${residentName} · ${money}`}
        breadcrumbs={[{ label: "Payments", href: "/finance/payments" }, { label: payment.receiptNumber }]}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <PrintButton label="Print / Save PDF" variant="default" />
            {payment.invoice && can(ctx, "invoices.view") ? (
              <Button asChild variant="outline">
                <Link href={`/finance/invoices/${payment.invoice.id}`}>
                  <FileText />
                  Invoice
                </Link>
              </Button>
            ) : null}
            {can(ctx, "residents.view") ? (
              <Button asChild variant="outline">
                <Link href={`/residents/${payment.resident.id}`}>
                  <UserRound />
                  Resident
                </Link>
              </Button>
            ) : null}
            {canVoid ? (
              <ConfirmAction
                trigger={
                  <Button variant="ghost" className="text-destructive">
                    <Ban />
                    Void
                  </Button>
                }
                title={`Void ${payment.receiptNumber}?`}
                description={
                  payment.invoice
                    ? `The ${money} will be removed from invoice ${payment.invoice.invoiceNumber}'s paid amount. The receipt stays on record, marked void.`
                    : "The receipt stays on record, marked void, and no longer counts towards collections."
                }
                confirmLabel="Void payment"
                destructive
                reason={{ label: "Reason", required: true, placeholder: "e.g. Cheque bounced, entered twice" }}
                action={voidPaymentAction.bind(null, payment.id)}
              />
            ) : null}
          </div>
        }
      />
      {payment.isCreditEntry ? (
        <p className="no-print mx-auto mb-4 max-w-2xl rounded-lg border bg-info-soft px-3 py-2 text-sm text-info">
          This entry records advance credit being used on an invoice. To reverse it, void the matching credit payment on that invoice.
        </p>
      ) : null}
      <ReceiptDocument payment={payment} timezone={ctx.organization.timezone} />
    </>
  );
}
