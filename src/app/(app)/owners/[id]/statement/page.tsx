import Link from "next/link";
import { AlertTriangle, Banknote, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EnumBadge } from "@/components/shared/status-badge";
import { PrintButton, PrintStyles } from "@/components/finance/print-button";
import { CreatePayoutDialog } from "@/components/owners/create-payout-dialog";
import { OwnerStatementDocument } from "@/components/owners/owner-statement-document";
import { OwnersModuleDisabled } from "@/components/owners/owners-module-disabled";
import { StatementPeriodPicker } from "@/components/owners/statement-period-picker";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404, sp } from "@/lib/page-helpers";
import { formatDate, formatMoney, todayInTimeZone } from "@/lib/format";
import { termsFor } from "@/lib/terms";
import { statementPeriodSchema } from "@/lib/validation/owners";
import { ownerPayoutStatusLabels, ownerPayoutStatusTones } from "@/config/owner-labels";
import { getOwnerStatement } from "@/services/owners/statement";
import { periodLabel } from "@/services/owners/period";
import { isOwnersEnabled } from "@/services/owners/scope";

export const metadata = { title: "Owner statement" };

export default async function OwnerStatementPage({ params, searchParams }: PageProps<"/owners/[id]/statement">) {
  const ctx = await requireTenantPage("owners.view");
  if (!isOwnersEnabled(ctx)) return <OwnersModuleDisabled canEnable={can(ctx, "settings.organization")} title="Owner statement" />;
  const { id } = await params;
  const query = await searchParams;
  const requested = { from: sp(query, "from"), to: sp(query, "to") };
  const hasRequest = !!(requested.from || requested.to);
  const valid = !!requested.from && !!requested.to && statementPeriodSchema.safeParse(requested).success;
  const statement = await loadOr404(getOwnerStatement(ctx, id, valid ? requested : {}));

  const terms = termsFor(ctx.organization.businessType);
  const locale = ctx.organization.locale;
  const money = (n: number) => formatMoney(n, ctx.organization.currency, locale);
  const today = todayInTimeZone(ctx.organization.timezone);
  const { owner, period } = statement;
  const label = periodLabel(period, locale);
  const blocking = statement.overlappingPayouts;
  const endsInFuture = period.to > today;
  const canCreatePayout = can(ctx, "owners.manage") && !owner.archivedAt && statement.lines.length > 0 && blocking.length === 0 && !endsInFuture;

  return (
    <>
      <PrintStyles />
      <PageHeader
        title={`Statement · ${label}`}
        description={`${owner.name} · ${statement.lines.length} ${statement.lines.length === 1 ? terms.property.toLowerCase() : terms.properties.toLowerCase()}`}
        breadcrumbs={[
          { label: "Owners", href: "/owners" },
          { label: owner.name, href: `/owners/${owner.id}` },
          { label: "Statement" },
        ]}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <PrintButton />
            {canCreatePayout ? (
              <CreatePayoutDialog
                ownerId={owner.id}
                ownerName={owner.name}
                from={period.from}
                to={period.to}
                totals={statement.totals}
                trigger={
                  <Button>
                    <Banknote />
                    Create payout
                  </Button>
                }
              />
            ) : null}
          </div>
        }
      />

      <div className="no-print mb-4 flex flex-col gap-3">
        <StatementPeriodPicker key={`${period.from}:${period.to}`} from={period.from} to={period.to} today={today} />

        {hasRequest && !valid ? (
          <Notice tone="warning" icon={AlertTriangle}>
            Those dates aren&apos;t a valid statement period (start must be before end, at most a year). Showing {label} instead.
          </Notice>
        ) : null}

        {blocking.length > 0 ? (
          <Notice tone="info" icon={Info}>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {blocking.length === 1 ? "A payout already covers" : `${blocking.length} payouts already cover`} part of this period:
              {blocking.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5">
                  <span className="font-medium">{periodLabel({ from: p.from, to: p.to }, locale)}</span>
                  <span className="tabular">{money(p.netPayable)}</span>
                  <EnumBadge value={p.status} labels={ownerPayoutStatusLabels} tones={ownerPayoutStatusTones} />
                </span>
              ))}
              <Link href={`/owners/payouts?owner=${owner.id}`} className="underline underline-offset-4">
                View payouts
              </Link>
            </span>
          </Notice>
        ) : null}

        {can(ctx, "owners.manage") && endsInFuture && blocking.length === 0 && statement.lines.length > 0 ? (
          <Notice tone="info" icon={Info}>
            This period hasn&apos;t ended yet. You can create a payout once it ends ({formatDate(period.to, locale)}), or pick a period ending today.
          </Notice>
        ) : null}
      </div>

      <OwnerStatementDocument statement={statement} terms={terms} />
    </>
  );
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: "info" | "warning";
  icon: typeof Info;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={
        tone === "warning"
          ? "flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
          : "flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm text-info"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
