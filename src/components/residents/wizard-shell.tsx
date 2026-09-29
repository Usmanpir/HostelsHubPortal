"use client";

import { Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type WizardStep = { key: string; label: string; description?: string };

/**
 * Multi-step workflow layout: a vertical stepper on desktop, a compact
 * progress header on mobile, and a footer that sticks to the bottom of the
 * viewport on small screens so the primary action is always reachable.
 */
export function WizardShell({
  steps,
  current,
  maxReached,
  onStepClick,
  title,
  description,
  children,
  footer,
}: {
  steps: WizardStep[];
  current: number;
  /** Furthest step the user has unlocked (earlier steps are clickable). */
  maxReached: number;
  onStepClick: (index: number) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const step = steps[current]!;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Steps" className="hidden lg:block">
        <ol className="sticky top-20 flex flex-col gap-1">
          {steps.map((s, i) => {
            const done = i < current;
            const active = i === current;
            const reachable = i <= maxReached;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={!reachable || active}
                  onClick={() => onStepClick(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start text-sm transition-colors",
                    active && "bg-accent font-medium text-accent-foreground",
                    !active && reachable && "hover:bg-muted",
                    !reachable && "text-muted-foreground/60",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular",
                      done && "border-primary bg-primary text-primary-foreground",
                      active && "border-primary text-primary",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="flex min-h-[60dvh] min-w-0 flex-col rounded-xl border bg-card">
        <header className="border-b px-4 py-4 sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground lg:hidden">
            <span className="tabular">
              Step {current + 1} of {steps.length}
            </span>
            <span className="truncate">{title}</span>
          </div>
          <Progress value={((current + 1) / steps.length) * 100} className="mb-4 h-1 lg:hidden" />
          <h2 className="text-lg font-semibold tracking-tight">{step.label}</h2>
          {step.description || description ? (
            <p className="mt-1 text-sm text-muted-foreground">{step.description ?? description}</p>
          ) : null}
        </header>
        <div className="flex-1 px-4 py-5 sm:px-6">{children}</div>
        <footer className="sticky bottom-0 z-10 flex items-center justify-between gap-2 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6">
          {footer}
        </footer>
      </section>
    </div>
  );
}

/** Label/value rows for review steps. */
export function ReviewList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y rounded-xl border">
      {items.map((i) => (
        <div key={i.label} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="min-w-0 text-end font-medium">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
