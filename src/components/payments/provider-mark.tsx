import { FlaskConical, Smartphone, Wallet } from "lucide-react";
import type { PaymentProvider } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * Text + icon marks for payment providers (no image assets). Colours follow
 * each brand loosely using the app's semantic tokens.
 */
export function ProviderMark({ provider, className, size = "md" }: { provider: PaymentProvider; className?: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-7 rounded-md" : "size-10 rounded-lg";
  const icon = size === "sm" ? "size-3.5" : "size-5";
  if (provider === "JAZZCASH") {
    return (
      <span className={cn("flex shrink-0 items-center justify-center bg-danger-soft text-danger", box, className)} aria-hidden>
        <Wallet className={icon} />
      </span>
    );
  }
  if (provider === "EASYPAISA") {
    return (
      <span className={cn("flex shrink-0 items-center justify-center bg-success-soft text-success", box, className)} aria-hidden>
        <Smartphone className={icon} />
      </span>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-info-soft text-info", box, className)} aria-hidden>
      <FlaskConical className={icon} />
    </span>
  );
}

/** Wordmark: "JazzCash" / "easypaisa" styled as text. */
export function ProviderWordmark({ provider, className }: { provider: PaymentProvider; className?: string }) {
  if (provider === "JAZZCASH") {
    return (
      <span className={cn("font-semibold tracking-tight", className)}>
        <span className="text-danger">Jazz</span>
        <span className="text-warning">Cash</span>
      </span>
    );
  }
  if (provider === "EASYPAISA") {
    return <span className={cn("font-semibold tracking-tight text-success lowercase", className)}>easypaisa</span>;
  }
  return <span className={cn("font-semibold tracking-tight", className)}>Test payment</span>;
}
