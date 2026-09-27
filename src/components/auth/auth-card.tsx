import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Title block used at the top of every auth screen. */
export function AuthHeading({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-7 flex flex-col gap-2">
      {Icon ? (
        <span className="mb-2 flex size-11 items-center justify-center rounded-xl border bg-card text-primary shadow-sm">
          <Icon className="size-5" />
        </span>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {description ? <p className="text-sm text-pretty text-muted-foreground">{description}</p> : null}
    </div>
  );
}

const tones = {
  error: { icon: AlertCircle, className: "border-danger/25 bg-danger-soft text-danger" },
  success: { icon: CheckCircle2, className: "border-success/25 bg-success-soft text-success" },
  info: { icon: Info, className: "border-info/25 bg-info-soft text-info" },
} as const;

/** Inline status message for forms (announced to screen readers). */
export function FormAlert({
  tone = "error",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm", toneClass, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4">{children}</div>
    </div>
  );
}
