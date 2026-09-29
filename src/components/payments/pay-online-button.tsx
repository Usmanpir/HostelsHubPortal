"use client";

import { useState, useTransition } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FormDialog } from "@/components/shared/form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import type { PaymentProvider } from "@/generated/prisma/enums";
import { paymentProviderLabels } from "@/config/payment-labels";
import { cn } from "@/lib/utils";
import { startOnlinePaymentAction } from "@/app/portal/actions";
import { GatewayRedirectForm, type GatewayForm } from "./gateway-redirect-form";
import { ProviderMark, ProviderWordmark } from "./provider-mark";

export type PayOnlineGateway = { provider: PaymentProvider; label: string; environment: "SANDBOX" | "LIVE" };

const DESCRIPTIONS: Record<PaymentProvider, string> = {
  JAZZCASH: "JazzCash mobile account, card or voucher",
  EASYPAISA: "Easypaisa mobile account or card",
  SIMULATOR: "Local development only — no real money moves",
};

export function PayOnlineButton({
  invoiceId,
  amountLabel,
  gateways,
  size,
  className,
  label = "Pay online",
}: {
  invoiceId: string;
  amountLabel: string;
  gateways: PayOnlineGateway[];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentProvider | null>(gateways.length === 1 ? gateways[0]!.provider : null);
  const [redirect, setRedirect] = useState<{ form: GatewayForm; label: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (gateways.length === 0) return null;

  const onContinue = () => {
    if (!selected) return;
    startTransition(async () => {
      try {
        const result = await startOnlinePaymentAction({ invoiceId, provider: selected });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRedirect({ form: result.data.form, label: paymentProviderLabels[selected] });
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        // Once the browser is leaving for the gateway, keep the dialog up.
        if (!redirect) setOpen(next);
      }}
      trigger={
        <Button size={size} className={className}>
          <CreditCard />
          {label}
        </Button>
      }
      title="Pay online"
      description={`You're paying ${amountLabel}. Choose how you'd like to pay.`}
    >
      {redirect ? (
        <GatewayRedirectForm form={redirect.form} label={redirect.label} />
      ) : (
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Payment method" className="grid gap-2">
            {gateways.map((g) => {
              const active = selected === g.provider;
              return (
                <button
                  key={g.provider}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(g.provider)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "border-primary bg-primary/5" : "hover:border-primary/30 hover:bg-accent/40",
                  )}
                >
                  <ProviderMark provider={g.provider} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <ProviderWordmark provider={g.provider} className="text-base" />
                      {g.environment === "SANDBOX" ? (
                        <StatusBadge tone="warning" dot={false}>
                          Test mode
                        </StatusBadge>
                      ) : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">{DESCRIPTIONS[g.provider]}</span>
                  </span>
                  <span
                    className={cn("size-4 shrink-0 rounded-full border", active ? "border-4 border-primary" : "border-input")}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            You&apos;ll complete the payment on the provider&apos;s secure page. Your receipt appears here as soon as the payment is confirmed.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={onContinue} disabled={!selected || pending}>
              {pending ? (
                <>
                  <Spinner />
                  Preparing…
                </>
              ) : selected ? (
                `Continue to ${paymentProviderLabels[selected]}`
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
