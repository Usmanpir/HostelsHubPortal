"use client";

import { AlertTriangle, CalendarClock, CreditCard, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { useOrg } from "@/components/shared/org-context";
import { subscriptionStatusLabels, subscriptionStatusTones } from "@/config/labels";
import { formatMoney } from "@/lib/format";
import { cancelSubscriptionAction, resumeSubscriptionAction } from "@/app/(app)/settings/actions";
import { formatPlanDate, type BillingSubscription } from "./billing-types";

export function SubscriptionSummary({ subscription, usable }: { subscription: BillingSubscription | null; usable: boolean }) {
  const { timezone, locale } = useOrg();
  const fmt = (d: Date | string | null | undefined) => formatPlanDate(d, timezone, locale);

  if (!subscription) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-4 text-warning" />
          No active subscription
        </div>
        <p className="text-sm text-muted-foreground">Choose a plan below to start adding hostels, beds, residents and staff.</p>
      </div>
    );
  }

  const { plan } = subscription;
  const trialing = subscription.status === "TRIALING";
  const ended = subscription.status === "CANCELED" || subscription.status === "EXPIRED";
  const { endsAt, daysLeft } = subscription;
  const price = subscription.interval === "YEARLY" ? plan.priceYearly : plan.priceMonthly;

  const dateLine = ended
    ? `Ended ${fmt(endsAt)}`
    : trialing
      ? daysLeft > 0
        ? `Trial ends ${fmt(endsAt)} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
        : `Trial ended ${fmt(endsAt)}`
      : subscription.cancelAtPeriodEnd
        ? `Access ends ${fmt(endsAt)}`
        : `Renews ${fmt(endsAt)}`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CreditCard className="size-5" />
          </span>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Current plan</p>
            <p className="text-lg font-semibold">{plan.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <EnumBadge value={subscription.status} labels={subscriptionStatusLabels} tones={subscriptionStatusTones} />
          {subscription.cancelAtPeriodEnd && !ended ? <StatusBadge tone="warning">Cancels at period end</StatusBadge> : null}
        </div>
      </div>

      {plan.description ? <p className="text-sm text-muted-foreground">{plan.description}</p> : null}

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Price</dt>
          <dd className="mt-0.5 font-semibold tabular">
            {plan.isTrial || price === 0 ? "Free" : `${formatMoney(price, plan.currency, locale)} / ${subscription.interval === "YEARLY" ? "year" : "month"}`}
          </dd>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <dt className="text-xs text-muted-foreground">Billing</dt>
          <dd className="mt-0.5 font-semibold">{trialing ? "Trial" : subscription.interval === "YEARLY" ? "Yearly" : "Monthly"}</dd>
        </div>
      </dl>

      <p className="flex items-center gap-2 text-sm">
        <CalendarClock className="size-4 text-muted-foreground" />
        {dateLine}
      </p>

      {!usable ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Your subscription is inactive. Choose a plan to keep adding records.
        </p>
      ) : null}

      {!ended ? (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {subscription.cancelAtPeriodEnd ? (
            <ConfirmAction
              trigger={
                <Button variant="outline" size="sm">
                  <RotateCcw />
                  Resume subscription
                </Button>
              }
              title="Resume your subscription?"
              description={`Your ${plan.name} plan will continue and renew as usual on ${fmt(endsAt)}.`}
              confirmLabel="Resume"
              action={() => resumeSubscriptionAction()}
            />
          ) : (
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  <XCircle />
                  Cancel {trialing ? "trial" : "subscription"}
                </Button>
              }
              title={`Cancel ${trialing ? "your trial" : "your subscription"}?`}
              description={`You'll keep full access until ${fmt(endsAt)}. After that you won't be able to add hostels, beds, residents or staff until you choose a plan. Your data is kept.`}
              confirmLabel="Cancel at period end"
              destructive
              action={() => cancelSubscriptionAction()}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
