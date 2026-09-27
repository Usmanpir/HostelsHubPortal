import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shown on every admin page: operators see platform metadata and aggregate counts only. */
export function PrivacyNotice({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground", className)}>
      <Lock className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Tenant data is private; support access requires the organization&apos;s consent. This console shows platform metadata and
        aggregate counts only.
      </span>
    </p>
  );
}
