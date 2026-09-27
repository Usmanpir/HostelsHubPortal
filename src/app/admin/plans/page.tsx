import Link from "next/link";
import { Check, Package, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { PrivacyNotice } from "@/components/admin/privacy-notice";
import { requireAdminPage } from "@/services/admin/guard";
import { listPlans } from "@/services/admin/plan-service";
import { formatMoney, formatNumber } from "@/lib/format";

export const metadata = { title: "Plans" };

const LIMIT_LABELS = [
  ["maxHostels", "hostels"],
  ["maxBeds", "beds"],
  ["maxResidents", "residents"],
  ["maxStaff", "staff"],
  ["maxStorageMb", "MB storage"],
] as const;

export default async function AdminPlansPage() {
  const ctx = await requireAdminPage();
  const plans = await listPlans(ctx);
  const newButton = (
    <Button asChild>
      <Link href="/admin/plans/new">
        <Plus />
        New plan
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title="Plans" description="Pricing, limits and features offered to organizations." actions={newButton}>
        <PrivacyNotice />
      </PageHeader>
      {plans.length === 0 ? (
        <EmptyState icon={Package} title="No plans yet" description="Create a plan to start assigning subscriptions." action={newButton} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <article key={p.id} className="flex flex-col rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{p.name}</h2>
                  <p className="font-mono text-xs text-muted-foreground">{p.key}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {!p.isActive ? <StatusBadge tone="neutral">Inactive</StatusBadge> : null}
                  {p.isActive && !p.isPublic ? <StatusBadge tone="warning">Hidden</StatusBadge> : null}
                  {p.isActive && p.isPublic ? <StatusBadge tone="success">Public</StatusBadge> : null}
                </div>
              </div>
              {p.description ? <p className="mt-2 text-sm text-muted-foreground">{p.description}</p> : null}
              <p className="mt-3 text-2xl font-semibold tabular">
                {formatMoney(p.priceMonthly, p.currency)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatMoney(p.priceYearly, p.currency)}/yr · {p.trialDays}-day trial
              </p>
              <ul className="mt-3 grid gap-1 text-sm">
                {LIMIT_LABELS.map(([key, label]) => {
                  const v = p.limits[key];
                  return (
                    <li key={key} className="text-muted-foreground">
                      <span className="font-medium text-foreground tabular">{v === null || v === undefined ? "Unlimited" : formatNumber(v)}</span> {label}
                    </li>
                  );
                })}
              </ul>
              {p.features.length ? (
                <ul className="mt-3 grid gap-1 text-xs">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 font-mono text-muted-foreground">
                      <Check className="size-3.5 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="min-h-4 flex-1" />
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  {p.liveSubscriptions} live · {p.subscriptions} total subscriptions
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/plans/${p.id}`}>
                    <Pencil />
                    Edit
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
