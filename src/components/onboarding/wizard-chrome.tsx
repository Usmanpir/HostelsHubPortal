import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WizardStep = { key: string; title: string; optional: boolean };

/** Vertical step list on desktop, compact progress bar on mobile. */
export function WizardProgress({
  steps,
  current,
  maxReachable,
}: {
  steps: readonly WizardStep[];
  current: number;
  /** Highest step the user may jump to directly. */
  maxReachable: number;
}) {
  const pct = Math.round(((current - 1) / (steps.length - 1)) * 100);
  return (
    <nav aria-label="Setup progress">
      <div className="lg:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{steps[current - 1]?.title}</span>
          <span className="text-muted-foreground">
            Step {current} of {steps.length}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Setup progress"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(pct, 4)}%` }} />
        </div>
      </div>

      <ol className="hidden flex-col gap-1 lg:flex">
        {steps.map((step, index) => {
          const n = index + 1;
          const state = n < current ? "done" : n === current ? "current" : "upcoming";
          const reachable = n <= maxReachable && n !== current;
          const body = (
            <>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && "border-primary bg-primary/10 text-primary ring-4 ring-primary/10",
                  state === "upcoming" && "bg-card text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : n}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("text-sm font-medium", state === "upcoming" && "text-muted-foreground")}>{step.title}</span>
                {step.optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
              </span>
            </>
          );
          return (
            <li key={step.key}>
              {reachable ? (
                <Link
                  href={`/onboarding?step=${n}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-2 py-2" aria-current={state === "current" ? "step" : undefined}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Card that frames a single step. */
export function StepCard({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-sm", className)}>
      <header className="border-b px-5 py-5 sm:px-7">
        {eyebrow ? <p className="text-xs font-medium tracking-wide text-primary uppercase">{eyebrow}</p> : null}
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{description}</p> : null}
      </header>
      <div className="px-5 py-6 sm:px-7">{children}</div>
    </section>
  );
}

/** Back / skip / continue row at the bottom of a step. */
export function StepFooter({
  step,
  skipTo,
  skipLabel = "Skip for now",
  children,
}: {
  step: number;
  /** Step to jump to when skipping (omit for required steps). */
  skipTo?: number;
  skipLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      {step > 1 ? (
        <Button asChild variant="ghost" className="justify-start text-muted-foreground sm:justify-center">
          <Link href={`/onboarding?step=${step - 1}`}>
            <ArrowLeft />
            Back
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {skipTo ? (
          <Button asChild variant="ghost">
            <Link href={`/onboarding?step=${skipTo}`}>{skipLabel}</Link>
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
