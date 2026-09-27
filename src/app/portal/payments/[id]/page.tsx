import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentHeader, DocumentPaper, PartyBlock } from "@/components/portal/document";
import { PrintButton } from "@/components/portal/print-button";
import { portalFormatters } from "@/components/portal/format";
import { receiptTitle } from "@/components/portal/payment-kind";
import { requireResidentPage } from "@/lib/tenant/resident";
import { loadOr404 } from "@/lib/page-helpers";
import { getPortalPayment } from "@/services/portal/billing-service";
import { paymentMethodLabels, paymentTypeLabels } from "@/config/labels";
import { cn } from "@/lib/utils";

export const metadata = { title: "Receipt" };

export default async function PortalReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireResidentPage();
  const { id } = await params;
  const p = await loadOr404(getPortalPayment(ctx, id));
  const fmt = portalFormatters(ctx);
  const voided = p.status === "VOIDED";
  const creditApplied = p.type === "ADVANCE" && p.amount < 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal/payments">
            <ArrowLeft className="rtl:rotate-180" />
            Payments
          </Link>
        </Button>
        <PrintButton />
      </div>

      <DocumentPaper className="relative overflow-hidden">
        {voided ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-black tracking-widest text-danger/10 uppercase select-none sm:text-8xl"
          >
            Void
          </span>
        ) : null}
        <DocumentHeader org={p.organization} title={receiptTitle(p.type, p.amount)} number={p.receiptNumber} />

        <div
          className={cn(
            "my-6 flex flex-col items-center gap-2 rounded-2xl py-6 text-center",
            voided ? "bg-muted" : "bg-success-soft/60",
          )}
        >
          {voided ? <CircleSlash className="size-7 text-muted-foreground" /> : <CheckCircle2 className="size-7 text-success" />}
          <p className="text-sm text-muted-foreground">
            {voided ? "This receipt was voided" : p.type === "REFUND" ? "Amount refunded" : creditApplied ? "Credit applied" : "Amount received"}
          </p>
          <p className={cn("text-3xl font-semibold tracking-tight tabular", voided && "line-through")}>{fmt.money(Math.abs(p.amount))}</p>
          <p className="text-sm text-muted-foreground">{fmt.date(p.paymentDate)}</p>
        </div>

        <div className="grid gap-4 border-y py-5 sm:grid-cols-2">
          <PartyBlock label="Received from" lines={[`${p.resident.firstName} ${p.resident.lastName}`, p.resident.residentCode]} />
          <PartyBlock label="Hostel" lines={[p.hostel.name, [p.hostel.address, p.hostel.city].filter(Boolean).join(", "), p.hostel.phone]} />
        </div>

        <dl className="grid gap-2 py-5 text-sm sm:grid-cols-2">
          <Item label="Type" value={paymentTypeLabels[p.type]} />
          <Item label="Method" value={paymentMethodLabels[p.method]} />
          {p.reference ? <Item label="Reference" value={p.reference} /> : null}
          {p.invoice ? (
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground">Invoice</dt>
              <dd className="font-medium">
                <Link href={`/portal/invoices/${p.invoice.id}`} className="font-mono hover:text-primary">
                  {p.invoice.invoiceNumber}
                </Link>
              </dd>
            </div>
          ) : null}
          {p.receivedBy ? <Item label="Received by" value={p.receivedBy.name} /> : null}
          <Item label="Recorded" value={fmt.dateTime(p.createdAt)} />
        </dl>

        {voided ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            Voided{p.voidedAt ? ` on ${fmt.date(p.voidedAt)}` : ""}
            {p.voidReason ? `: ${p.voidReason}` : "."} This receipt is no longer valid.
          </p>
        ) : null}
        {p.notes ? <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{p.notes}</p> : null}
        {p.organization.invoiceFooter ? (
          <p className="mt-6 border-t pt-4 text-center text-xs whitespace-pre-line text-muted-foreground">{p.organization.invoiceFooter}</p>
        ) : null}
      </DocumentPaper>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
