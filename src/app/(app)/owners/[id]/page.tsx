import Link from "next/link";
import { Archive, ArchiveRestore, Banknote, Building2, FileText, Link2, Mail, MapPin, Pencil, Percent, Phone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { EnumBadge, StatusBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { LinkPropertiesDialog } from "@/components/owners/link-properties-dialog";
import { OwnersModuleDisabled } from "@/components/owners/owners-module-disabled";
import { PayoutActions } from "@/components/owners/payout-actions";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDate, formatMoney, todayInTimeZone } from "@/lib/format";
import { PROPERTY_KIND_LABELS, termsFor } from "@/lib/terms";
import { paymentMethodLabels } from "@/config/labels";
import { ownerPayoutStatusLabels, ownerPayoutStatusTones } from "@/config/owner-labels";
import { getOwner } from "@/services/owners/owner-service";
import { periodLabel } from "@/services/owners/period";
import { isOwnersEnabled } from "@/services/owners/scope";
import { archiveOwnerAction, restoreOwnerAction } from "../actions";

export const metadata = { title: "Owner" };

export default async function OwnerDetailPage({ params }: PageProps<"/owners/[id]">) {
  const ctx = await requireTenantPage("owners.view");
  if (!isOwnersEnabled(ctx)) return <OwnersModuleDisabled canEnable={can(ctx, "settings.organization")} />;
  const { id } = await params;
  const owner = await loadOr404(getOwner(ctx, id));
  const terms = termsFor(ctx.organization.businessType);
  const locale = ctx.organization.locale;
  const money = (n: number) => formatMoney(n, ctx.organization.currency, locale);
  const canManage = can(ctx, "owners.manage");
  const canViewProperties = can(ctx, "hostels.view");
  const archived = !!owner.archivedAt;
  const today = todayInTimeZone(ctx.organization.timezone);
  const linkedCount = owner.properties.length;
  const bank = [owner.bankName, owner.bankAccountTitle, owner.bankAccountNumber].filter(Boolean);

  const linkButton =
    canManage && !archived ? (
      <LinkPropertiesDialog
        ownerId={owner.id}
        ownerName={owner.name}
        trigger={
          <Button variant="outline">
            <Link2 />
            Link {terms.properties.toLowerCase()}
          </Button>
        }
      />
    ) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {owner.name}
            {archived ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{owner.ownerCode}</span>
            <span>{owner.commissionPercent}% default commission</span>
          </span>
        }
        breadcrumbs={[{ label: "Owners", href: "/owners" }, { label: owner.name }]}
        actions={
          <>
            <Button asChild>
              <Link href={`/owners/${owner.id}/statement`}>
                <FileText />
                Statement
              </Link>
            </Button>
            {linkButton}
            {canManage && !archived ? (
              <Button asChild variant="outline">
                <Link href={`/owners/${owner.id}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            ) : null}
            {canManage ? (
              archived ? (
                <ConfirmAction
                  trigger={
                    <Button variant="outline">
                      <ArchiveRestore />
                      Restore
                    </Button>
                  }
                  title={`Restore ${owner.name}?`}
                  confirmLabel="Restore"
                  action={restoreOwnerAction.bind(null, owner.id)}
                />
              ) : (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" className="text-destructive">
                      <Archive />
                      Archive
                    </Button>
                  }
                  title={`Archive ${owner.name}?`}
                  description={
                    linkedCount > 0
                      ? `${linkedCount} linked ${linkedCount === 1 ? terms.property.toLowerCase() : terms.properties.toLowerCase()} will be unlinked. Past payouts stay on record. Pending payouts must be paid or cancelled first.`
                      : "Archived owners are hidden from day-to-day screens. Past payouts stay on record. Pending payouts must be paid or cancelled first."
                  }
                  confirmLabel={linkedCount > 0 ? "Unlink and archive" : "Archive"}
                  destructive
                  action={archiveOwnerAction.bind(null, owner.id, linkedCount > 0)}
                />
              )
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={terms.properties} value={owner.stats.propertyCount} icon={Building2} hint={`${owner.stats.units} ${terms.units.toLowerCase()}`} />
        <StatCard
          label="Occupancy"
          value={owner.stats.occupancy.totalBeds > 0 ? `${owner.stats.occupancy.occupancyRate}%` : "—"}
          icon={Percent}
          tone="info"
          hint={owner.stats.occupancy.totalBeds > 0 ? `${owner.stats.occupancy.occupiedBeds} of ${owner.stats.occupancy.totalBeds - owner.stats.occupancy.maintenanceBeds - owner.stats.occupancy.inactiveBeds} occupied` : undefined}
        />
        <StatCard
          label="Collected this month"
          value={money(owner.stats.collectedThisMonth)}
          icon={Wallet}
          tone="success"
          hint={periodLabel(owner.period, locale)}
          href={`/owners/${owner.id}/statement?from=${owner.period.from}&to=${owner.period.to}`}
        />
        <StatCard
          label="Pending payouts"
          value={money(owner.stats.pendingTotal)}
          icon={Banknote}
          tone={owner.stats.pendingCount > 0 ? "warning" : "default"}
          hint={`${owner.stats.pendingCount} pending · ${money(owner.stats.paidTotal)} paid to date`}
          href={`/owners/payouts?owner=${owner.id}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Linked {terms.properties.toLowerCase()}</h2>
              <span className="text-xs text-muted-foreground">{linkedCount}</span>
            </header>
            {linkedCount === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Building2}
                  title={`No ${terms.properties.toLowerCase()} linked`}
                  description={`Link the ${terms.properties.toLowerCase()} this owner owns to include their rent and expenses in statements.`}
                  action={linkButton}
                  className="border-0 py-8"
                />
              </div>
            ) : (
              <ul className="divide-y">
                {owner.properties.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {canViewProperties ? (
                          <Link href={`/hostels/${p.id}`} className="truncate text-sm font-medium hover:text-primary">
                            {p.name}
                          </Link>
                        ) : (
                          <span className="truncate text-sm font-medium">{p.name}</span>
                        )}
                        {p.archivedAt ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
                      </div>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-mono">{p.code}</span>
                        <span>{PROPERTY_KIND_LABELS[p.kind]}</span>
                        {p.city ? (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="size-3" />
                            {p.city}
                          </span>
                        ) : null}
                        <span>
                          {p.units} {p.units === 1 ? terms.unit.toLowerCase() : terms.units.toLowerCase()}
                        </span>
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm sm:w-80 sm:shrink-0">
                      <div>
                        <p className="text-xs text-muted-foreground">Occupancy</p>
                        {p.occupancy && p.occupancy.totalBeds > 0 ? (
                          <div className="flex flex-col gap-1">
                            <span className="tabular">{p.occupancy.occupancyRate}%</span>
                            <Progress value={p.occupancy.occupancyRate} className="h-1.5" aria-label={`${p.name} occupancy`} />
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fee</p>
                        <p className="tabular">
                          {p.effectiveFeePercent}%
                          {p.managementFeePercent !== null ? <span className="block text-xs text-muted-foreground">own rate</span> : null}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-xs text-muted-foreground">This month</p>
                        <p className="tabular truncate">{money(p.collectedThisMonth)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Recent payouts</h2>
              <Link href={`/owners/payouts?owner=${owner.id}`} className="text-xs text-muted-foreground hover:text-primary">
                View all
              </Link>
            </header>
            {owner.recentPayouts.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Banknote}
                  title="No payouts yet"
                  description="Open the statement for a period and create a payout from it."
                  className="border-0 py-8"
                />
              </div>
            ) : (
              <ul className="divide-y">
                {owner.recentPayouts.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/owners/${owner.id}/statement?from=${p.periodStart}&to=${p.periodEnd}`}
                        className="text-sm font-medium hover:text-primary"
                      >
                        {periodLabel({ from: p.periodStart, to: p.periodEnd }, locale)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {p.paidAt
                          ? `Paid ${formatDate(p.paidAt, locale)}${p.paymentMethod ? ` · ${paymentMethodLabels[p.paymentMethod]}` : ""}${p.reference ? ` · ${p.reference}` : ""}`
                          : `Created ${formatDate(p.createdAt, locale)}`}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className={p.status === "CANCELLED" ? "tabular text-sm text-muted-foreground line-through" : "tabular text-sm font-medium"}>
                        {money(p.netPayable)}
                      </span>
                      <EnumBadge value={p.status} labels={ownerPayoutStatusLabels} tones={ownerPayoutStatusTones} />
                      <PayoutActions
                        payout={{ ...p, owner: { name: owner.name } }}
                        today={today}
                        size="icon-sm"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Contact</h2>
            <dl className="grid gap-3 text-sm">
              {owner.phone ? (
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-muted-foreground" />
                  <a href={`tel:${owner.phone}`} className="hover:text-primary">
                    {owner.phone}
                  </a>
                </div>
              ) : null}
              {owner.email ? (
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  <a href={`mailto:${owner.email}`} className="truncate hover:text-primary">
                    {owner.email}
                  </a>
                </div>
              ) : null}
              {owner.address ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Address</dt>
                  <dd>{owner.address}</dd>
                </div>
              ) : null}
              {owner.idNumber ? (
                <div>
                  <dt className="text-xs text-muted-foreground">CNIC / ID</dt>
                  <dd className="font-mono text-xs">{owner.idNumber}</dd>
                </div>
              ) : null}
              {!owner.phone && !owner.email && !owner.address && !owner.idNumber ? (
                <p className="text-muted-foreground">No contact details yet.</p>
              ) : null}
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Bank details</h2>
            {bank.length ? (
              <dl className="grid gap-3 text-sm">
                {owner.bankName ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Bank</dt>
                    <dd>{owner.bankName}</dd>
                  </div>
                ) : null}
                {owner.bankAccountTitle ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Account title</dt>
                    <dd>{owner.bankAccountTitle}</dd>
                  </div>
                ) : null}
                {owner.bankAccountNumber ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Account number</dt>
                    <dd className="font-mono text-xs break-all">{owner.bankAccountNumber}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No bank details on file.</p>
            )}
          </section>

          {owner.notes ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Notes</h2>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{owner.notes}</p>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
