import Link from "next/link";
import { Globe } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { onlinePaymentStatusLabels, onlinePaymentStatusTones, paymentProviderLabels } from "@/config/payment-labels";
import type { StaffOnlinePaymentRow } from "@/services/payments/online-payment-service";
import { ProviderMark } from "./provider-mark";

/** Recent online payment attempts (all statuses) for Finance → Payments → Online. */
export function StaffOnlinePayments({
  rows,
  money,
  dateTime,
  canViewInvoices,
  canViewResidents,
  filtered,
}: {
  rows: StaffOnlinePaymentRow[];
  money: (n: number) => string;
  dateTime: (d: Date | string) => string;
  canViewInvoices: boolean;
  canViewResidents: boolean;
  filtered: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        title={filtered ? "No online payments with this status" : "No online payments yet"}
        description={
          filtered
            ? "Try another status."
            : "When residents pay from the portal with JazzCash or Easypaisa, each attempt appears here. Set up gateways in Settings → Online payments."
        }
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <ul className="divide-y">
        {rows.map((r) => {
          const name = `${r.resident.firstName} ${r.resident.lastName}`.trim();
          return (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <ProviderMark provider={r.provider} size="sm" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                    {canViewResidents ? (
                      <Link href={`/residents/${r.resident.id}`} className="hover:text-primary">
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                    <span className="text-xs font-normal text-muted-foreground">{r.hostel.name}</span>
                    {r.environment === "SANDBOX" ? (
                      <StatusBadge tone="warning" dot={false}>
                        Sandbox
                      </StatusBadge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {paymentProviderLabels[r.provider]} · {dateTime(r.createdAt)} ·{" "}
                    {canViewInvoices ? (
                      <Link href={`/finance/invoices/${r.invoice.id}`} className="font-mono hover:text-primary">
                        {r.invoice.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="font-mono">{r.invoice.invoiceNumber}</span>
                    )}{" "}
                    · <span className="font-mono">{r.txnRef}</span>
                    {r.gatewayTxnId ? (
                      <>
                        {" "}
                        · Gateway ref <span className="font-mono">{r.gatewayTxnId}</span>
                      </>
                    ) : null}
                  </p>
                  {r.responseMessage && r.status !== "SUCCEEDED" ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.responseCode ? `${r.responseCode}: ` : ""}
                      {r.responseMessage}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 ps-10 sm:flex-col sm:items-end sm:gap-1 sm:ps-0">
                <span className="text-sm font-medium tabular">{money(r.amount)}</span>
                <div className="flex items-center gap-2">
                  {r.payment ? (
                    <Link href={`/finance/payments/${r.payment.id}`} className="font-mono text-xs text-primary hover:underline">
                      {r.payment.receiptNumber}
                    </Link>
                  ) : null}
                  <EnumBadge value={r.status} labels={onlinePaymentStatusLabels} tones={onlinePaymentStatusTones} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
