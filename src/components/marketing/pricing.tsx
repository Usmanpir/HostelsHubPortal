import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/services/auth/onboarding-service";
import { planFeatureLines, planLimitLines } from "./plan-utils";

/** The plan to highlight: the most popular mid-tier paid plan, by convention "business". */
const FEATURED_KEY = "business";

export function PricingTable({ plans, signedIn }: { plans: PublicPlan[]; signedIn: boolean }) {
  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed bg-card p-8 text-center">
        <p className="font-medium">Pricing is being updated</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Talk to us for current plans, or start a free trial and choose a plan later.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button asChild>
            <Link href="/register">Start free trial</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="#contact">Contact us</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-4",
        plans.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : plans.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2",
      )}
    >
      {plans.map((plan) => {
        const featured = plan.key === FEATURED_KEY;
        const free = plan.priceMonthly <= 0;
        const yearlySaving =
          plan.priceYearly > 0 && plan.priceMonthly > 0 ? Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100) : 0;
        const features = planFeatureLines(plan.features);
        return (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-card p-6",
              featured && "border-primary/50 shadow-xl shadow-primary/10 ring-1 ring-primary/30",
            )}
          >
            {featured ? (
              <span className="absolute -top-3 inset-s-6 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                <Sparkles className="size-3" /> Recommended
              </span>
            ) : null}
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            {plan.description ? <p className="mt-1 min-h-10 text-sm text-pretty text-muted-foreground">{plan.description}</p> : null}
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight tabular">{free ? "Free" : formatMoney(plan.priceMonthly, plan.currency)}</span>
              {free ? null : <span className="text-sm text-muted-foreground">/ month</span>}
            </div>
            <p className="mt-1 h-5 text-xs text-muted-foreground">
              {free
                ? plan.trialDays > 0
                  ? `for ${plan.trialDays} days`
                  : ""
                : plan.priceYearly > 0
                  ? `or ${formatMoney(plan.priceYearly, plan.currency)} / year${yearlySaving > 0 ? ` · save ${yearlySaving}%` : ""}`
                  : ""}
            </p>
            <Button asChild className="mt-5 h-10" variant={featured ? "default" : "outline"}>
              <Link href={signedIn ? "/dashboard" : `/register?plan=${encodeURIComponent(plan.key)}`}>
                {signedIn ? "Open dashboard" : free ? "Start free trial" : plan.trialDays > 0 ? `Try ${plan.name} free` : `Choose ${plan.name}`}
              </Link>
            </Button>
            <ul className="mt-6 grid gap-2.5 border-t pt-5 text-sm">
              {planLimitLines(plan.limits).map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {line}
                </li>
              ))}
              {features.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
