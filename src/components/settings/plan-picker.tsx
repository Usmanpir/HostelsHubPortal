"use client";

import { useState } from "react";
import { Check, Lock, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useOrg } from "@/components/shared/org-context";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { changePlanAction } from "@/app/(app)/settings/actions";
import {
  ALL_PLAN_FEATURES,
  formatLimit,
  limitRows,
  planFeatureLabels,
  type BillingPlan,
  type BillingSubscription,
} from "./billing-types";

type Interval = "MONTHLY" | "YEARLY";

export function PlanPicker({ plans, subscription }: { plans: BillingPlan[]; subscription: BillingSubscription | null }) {
  const { locale } = useOrg();
  const [interval, setBillingInterval] = useState<Interval>(
    subscription && subscription.status !== "TRIALING" ? subscription.interval : "MONTHLY",
  );

  if (plans.length === 0) {
    return <EmptyState title="No plans available" description="Plans haven't been configured yet. Please contact support." />;
  }

  const current = subscription?.plan ?? null;
  const currentActive =
    !!subscription && subscription.status === "ACTIVE" && !subscription.cancelAtPeriodEnd;
  const maxSaving = Math.max(
    0,
    ...plans.map((p) => (p.priceMonthly > 0 ? Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100) : 0)),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={interval}
          onValueChange={(v) => v && setBillingInterval(v as Interval)}
          aria-label="Billing interval"
        >
          <ToggleGroupItem value="MONTHLY" className="px-3">
            Monthly
          </ToggleGroupItem>
          <ToggleGroupItem value="YEARLY" className="px-3">
            Yearly
          </ToggleGroupItem>
        </ToggleGroup>
        {maxSaving > 0 ? <span className="text-sm text-success">Save up to {maxSaving}% with yearly billing</span> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {plans.map((plan) => {
          const isCurrentPlan = current?.id === plan.id;
          const isExactCurrent = isCurrentPlan && subscription?.interval === interval && currentActive;
          const price = interval === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
          const perMonth = interval === "YEARLY" && plan.priceYearly > 0 ? plan.priceYearly / 12 : null;
          const blocked = plan.blockers.length > 0;
          const direction =
            !current || current.isTrial
              ? "Choose"
              : plan.priceMonthly > current.priceMonthly
                ? "Upgrade to"
                : plan.priceMonthly < current.priceMonthly
                  ? "Downgrade to"
                  : "Switch to";
          const label =
            isCurrentPlan && currentActive
              ? `Switch to ${interval === "YEARLY" ? "yearly" : "monthly"}`
              : isCurrentPlan
                ? `Renew ${plan.name}`
                : `${direction} ${plan.name}`;

          return (
            <article
              key={plan.id}
              className={cn(
                "flex flex-col gap-4 rounded-xl border bg-card p-5",
                isCurrentPlan && "border-primary/40 ring-1 ring-primary/20",
              )}
            >
              <header className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{plan.name}</h3>
                  {isCurrentPlan ? (
                    <StatusBadge tone="accent" dot={false}>
                      Current
                    </StatusBadge>
                  ) : null}
                </div>
                {plan.description ? <p className="text-sm text-muted-foreground">{plan.description}</p> : null}
              </header>

              <div>
                <p className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight tabular">
                    {price === 0 ? "Free" : formatMoney(price, plan.currency, locale)}
                  </span>
                  {price > 0 ? (
                    <span className="text-sm text-muted-foreground">/ {interval === "YEARLY" ? "year" : "month"}</span>
                  ) : null}
                </p>
                {perMonth !== null ? (
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(Math.round(perMonth * 100) / 100, plan.currency, locale)} per month, billed yearly
                  </p>
                ) : null}
              </div>

              <ul className="flex flex-col gap-1.5 text-sm">
                {limitRows.map((row) => (
                  <li key={row.key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium tabular">{formatLimit(plan.limits[row.key], row.unit)}</span>
                  </li>
                ))}
              </ul>

              <ul className="flex flex-col gap-1.5 border-t pt-4 text-sm">
                {ALL_PLAN_FEATURES.map((feature) => {
                  const included = plan.features.includes(feature);
                  return (
                    <li key={feature} className={cn("flex items-center gap-2", !included && "text-muted-foreground")}>
                      {included ? <Check className="size-4 text-success" /> : <Minus className="size-4" />}
                      {planFeatureLabels[feature] ?? feature}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-auto flex flex-col gap-2 pt-2">
                {blocked && !isExactCurrent ? (
                  <div className="rounded-lg bg-warning-soft p-3 text-xs">
                    <p className="flex items-center gap-1.5 font-medium text-warning">
                      <Lock className="size-3.5" />
                      Your usage is over this plan&apos;s limits
                    </p>
                    <ul className="mt-1 list-disc ps-5 text-muted-foreground">
                      {plan.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {isExactCurrent ? (
                  <Button variant="outline" disabled>
                    Current plan
                  </Button>
                ) : (
                  <ConfirmAction
                    trigger={
                      <Button variant={isCurrentPlan ? "outline" : "default"} disabled={blocked}>
                        {label}
                      </Button>
                    }
                    title={`${label}?`}
                    description={
                      <>
                        You&apos;ll be billed{" "}
                        <span className="font-medium text-foreground">
                          {price === 0 ? "nothing" : formatMoney(price, plan.currency, locale)}
                        </span>{" "}
                        {price === 0 ? "" : interval === "YEARLY" ? "per year" : "per month"}. The new plan&apos;s limits and features apply
                        immediately{subscription?.status === "TRIALING" ? " and your trial ends" : ""}.
                      </>
                    }
                    confirmLabel="Confirm change"
                    action={() => changePlanAction({ planKey: plan.key, interval })}
                    onSuccess={(result) => {
                      if (result.kind === "redirect") window.location.assign(result.url);
                    }}
                  />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
