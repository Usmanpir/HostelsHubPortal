import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown when a setting requires a plan feature the organization doesn't have. */
export function UpgradeHint({
  title,
  description,
  canManageBilling,
  className,
}: {
  title: string;
  description: string;
  canManageBilling: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-violet/20 bg-violet-soft p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/70 text-violet">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">
          {description}
          {canManageBilling ? null : " Ask your organization owner to upgrade."}
        </p>
      </div>
      {canManageBilling ? (
        <Button asChild size="sm" className="self-start sm:self-center">
          <Link href="/settings/billing">View plans</Link>
        </Button>
      ) : null}
    </div>
  );
}
