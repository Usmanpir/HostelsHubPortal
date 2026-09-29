import { CheckCircle2, CircleAlert, Clock, XCircle } from "lucide-react";
import type { PaymentResultParam } from "@/lib/validation/payments";
import { cn } from "@/lib/utils";

const CONTENT: Record<PaymentResultParam, { title: string; body: string; tone: string; icon: typeof CheckCircle2 }> = {
  success: {
    title: "Payment successful",
    body: "Thank you! Your payment was confirmed and a receipt has been added to this invoice.",
    tone: "border-success/30 bg-success-soft text-success",
    icon: CheckCircle2,
  },
  pending: {
    title: "Payment is being confirmed",
    body: "We haven't received a final confirmation from the payment provider yet. If money was deducted, the receipt will appear here automatically — you don't need to pay again.",
    tone: "border-warning/30 bg-warning-soft text-warning",
    icon: Clock,
  },
  failed: {
    title: "Payment didn't go through",
    body: "No payment was recorded. You can try again or choose another method.",
    tone: "border-danger/30 bg-danger-soft text-danger",
    icon: XCircle,
  },
  cancelled: {
    title: "Payment cancelled",
    body: "You cancelled the payment. Nothing was charged.",
    tone: "border-border bg-muted text-muted-foreground",
    icon: XCircle,
  },
  error: {
    title: "We couldn't confirm this payment",
    body: "The response from the payment provider couldn't be verified. If money was deducted, contact the hostel office with the time of payment.",
    tone: "border-danger/30 bg-danger-soft text-danger",
    icon: CircleAlert,
  },
};

export function PaymentResultBanner({ result, className }: { result: PaymentResultParam; className?: string }) {
  const c = CONTENT[result];
  const Icon = c.icon;
  return (
    <div role="status" className={cn("no-print flex items-start gap-3 rounded-xl border px-4 py-3", c.tone, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{c.title}</p>
        <p className="mt-0.5 text-sm text-foreground/80">{c.body}</p>
      </div>
    </div>
  );
}
