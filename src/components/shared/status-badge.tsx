import { cn } from "@/lib/utils";
import type { Tone } from "@/config/labels";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-violet-soft text-violet",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  accent: "bg-violet",
};

export function StatusBadge({ tone = "neutral", children, className, dot = true }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", dotClasses[tone])} /> : null}
      {children}
    </span>
  );
}

/** Render an enum value with its label + tone maps. */
export function EnumBadge<K extends string>({ value, labels, tones }: { value: K; labels: Record<K, string>; tones?: Record<K, Tone> }) {
  return <StatusBadge tone={tones?.[value] ?? "neutral"}>{labels[value] ?? value}</StatusBadge>;
}

export { toneClasses, dotClasses };
