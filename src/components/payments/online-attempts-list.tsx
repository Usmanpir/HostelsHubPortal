import Link from "next/link";
import { EnumBadge } from "@/components/shared/status-badge";
import type { OnlinePaymentStatus, PaymentProvider } from "@/generated/prisma/enums";
import { onlinePaymentStatusLabels, onlinePaymentStatusTones, paymentProviderLabels } from "@/config/payment-labels";
import { ProviderMark } from "./provider-mark";

export type OnlineAttempt = {
  id: string;
  provider: PaymentProvider;
  amount: number;
  status: OnlinePaymentStatus;
  txnRef: string;
  responseMessage: string | null;
  createdAt: Date | string;
  payment: { id: string; receiptNumber: string } | null;
};

/** Online payment attempts for one invoice (resident portal). */
export function OnlineAttemptsList({
  attempts,
  money,
  dateTime,
  receiptHref,
}: {
  attempts: OnlineAttempt[];
  money: (n: number) => string;
  dateTime: (d: Date | string) => string;
  receiptHref: (paymentId: string) => string;
}) {
  if (attempts.length === 0) return null;
  return (
    <section className="no-print rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Online payment attempts</h2>
        <span className="text-xs text-muted-foreground">{attempts.length}</span>
      </header>
      <ul className="divide-y">
        {attempts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <ProviderMark provider={a.provider} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {paymentProviderLabels[a.provider]} · <span className="tabular">{money(a.amount)}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {dateTime(a.createdAt)} · <span className="font-mono">{a.txnRef}</span>
                {a.status !== "SUCCEEDED" && a.status !== "PENDING" && a.responseMessage ? ` · ${a.responseMessage}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <EnumBadge value={a.status} labels={onlinePaymentStatusLabels} tones={onlinePaymentStatusTones} />
              {a.payment ? (
                <Link href={receiptHref(a.payment.id)} className="font-mono text-xs text-primary hover:underline">
                  {a.payment.receiptNumber}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
