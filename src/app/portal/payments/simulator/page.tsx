import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnumBadge } from "@/components/shared/status-badge";
import { portalFormatters } from "@/components/portal/format";
import { requireResidentPage } from "@/lib/tenant/resident";
import { loadOr404, sp } from "@/lib/page-helpers";
import { onlinePaymentStatusLabels, onlinePaymentStatusTones } from "@/config/payment-labels";
import { getPortalSimulatorPayment } from "@/services/payments/online-payment-service";
import { simulatorCallbackFields, simulatorEnabled, type SimulatorOutcome } from "@/services/payments/simulator";
import { returnUrlFor } from "@/services/payments/registry";

export const metadata = { title: "Payment simulator" };

/**
 * Local stand-in for a gateway's hosted checkout. Each button posts a
 * server-signed outcome to the real return route, exercising the same
 * verification + completion path as JazzCash / Easypaisa. Unavailable in
 * production (simulatorEnabled() is false there).
 */
export default async function PaymentSimulatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!simulatorEnabled()) notFound();
  const ctx = await requireResidentPage();
  const ref = sp(await searchParams, "ref");
  if (!ref) notFound();
  const attempt = await loadOr404(getPortalSimulatorPayment(ctx, ref));
  const fmt = portalFormatters(ctx);
  const action = returnUrlFor("SIMULATOR");
  const outcomes: { outcome: SimulatorOutcome; label: string; icon: typeof Check; variant: React.ComponentProps<typeof Button>["variant"] }[] = [
    { outcome: "approve", label: "Approve payment", icon: Check, variant: "default" },
    { outcome: "decline", label: "Decline", icon: X, variant: "outline" },
    { outcome: "cancel", label: "Cancel", icon: X, variant: "ghost" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 py-6">
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          <span className="font-semibold">Development simulator.</span> No real money moves. This page only exists when{" "}
          <code className="font-mono text-xs">PAYMENTS_SIMULATOR=true</code> outside production.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Test checkout</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular">{fmt.money(attempt.amount)}</p>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Invoice</dt>
            <dd className="font-mono">{attempt.invoice.invoiceNumber}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="font-mono">{attempt.txnRef}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <EnumBadge value={attempt.status} labels={onlinePaymentStatusLabels} tones={onlinePaymentStatusTones} />
            </dd>
          </div>
        </dl>

        {attempt.status === "PENDING" ? (
          <div className="mt-5 flex flex-col gap-2">
            {outcomes.map(({ outcome, label, icon: Icon, variant }) => (
              <form key={outcome} action={action} method="POST">
                {Object.entries(simulatorCallbackFields(attempt.txnRef, outcome, attempt.amount)).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <Button type="submit" variant={variant} className="w-full">
                  <Icon />
                  {label}
                </Button>
              </form>
            ))}
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">This attempt has already been processed.</p>
            <Button asChild variant="outline">
              <Link href={`/portal/invoices/${attempt.invoice.id}`}>Back to invoice</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
