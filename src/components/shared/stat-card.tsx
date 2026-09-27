import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  href?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const toneIcon = {
    default: "bg-accent text-accent-foreground",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  }[tone];

  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors",
        href && "hover:border-primary/30 hover:bg-accent/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon ? (
          <span className={cn("flex size-8 items-center justify-center rounded-lg", toneIcon)}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <div className="tabular text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}
