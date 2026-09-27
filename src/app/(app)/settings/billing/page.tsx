import { CheckCircle2, Info } from "lucide-react";
import { SectionHeader } from "@/components/settings/section-header";
import { PlanPicker } from "@/components/settings/plan-picker";
import { SubscriptionSummary } from "@/components/settings/subscription-summary";
import { UsageMeters } from "@/components/settings/usage-meters";
import { sp } from "@/lib/page-helpers";
import { getBillingOverview } from "@/services/organization/subscription-service";
import { requireSettingsPage } from "../guard";

export const metadata = { title: "Subscription" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireSettingsPage("settings.billing");
  const [overview, params] = await Promise.all([getBillingOverview(ctx), searchParams]);
  const checkout = sp(params, "checkout");

  return (
    <div className="flex flex-col gap-8">
      {checkout === "success" ? (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          Payment received. Your plan will update as soon as the payment provider confirms it.
        </div>
      ) : checkout === "cancelled" ? (
        <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          <Info className="size-4 text-muted-foreground" />
          Checkout was cancelled — your plan hasn&apos;t changed.
        </div>
      ) : null}

      <section>
        <SectionHeader title="Subscription" description="Your current plan, billing period and usage." />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <SubscriptionSummary subscription={overview.subscription} usable={overview.usable} />
          <UsageMeters usage={overview.usage} limits={overview.subscription?.plan.limits ?? null} />
        </div>
      </section>

      <section>
        <SectionHeader
          title="Plans"
          description={
            overview.provider === "manual"
              ? "Plan changes take effect immediately. Invoices are settled offline with our billing team."
              : "You'll be taken to a secure checkout to complete the change."
          }
        />
        <PlanPicker plans={overview.plans} subscription={overview.subscription} />
      </section>
    </div>
  );
}
