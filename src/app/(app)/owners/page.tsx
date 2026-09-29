import Link from "next/link";
import { Banknote, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { OwnersTable } from "@/components/owners/owners-table";
import { OwnersModuleDisabled } from "@/components/owners/owners-module-disabled";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { termsFor } from "@/lib/terms";
import { listOwners } from "@/services/owners/owner-service";
import { parseOwnerFilters } from "@/services/owners/filters";
import { periodLabel } from "@/services/owners/period";
import { isOwnersEnabled } from "@/services/owners/scope";

export const metadata = { title: "Owners" };

export default async function OwnersPage({ searchParams }: PageProps<"/owners">) {
  const ctx = await requireTenantPage("owners.view");
  if (!isOwnersEnabled(ctx)) return <OwnersModuleDisabled canEnable={can(ctx, "settings.organization")} />;
  const params = await searchParams;
  const filters = parseOwnerFilters(params);
  const data = await listOwners(ctx, filters);
  const terms = termsFor(ctx.organization.businessType);
  const canManage = can(ctx, "owners.manage");

  return (
    <>
      <PageHeader
        title="Owners"
        description={`Landlords whose ${terms.properties.toLowerCase()} you manage — occupancy, rent collected and what you owe them.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/owners/payouts">
                <Banknote />
                Payouts
              </Link>
            </Button>
            {canManage ? (
              <Button asChild>
                <Link href="/owners/new">
                  <Plus />
                  Add owner
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <OwnersTable
        data={data}
        hasActiveFilters={!!filters.q || (!!filters.status && filters.status !== "ACTIVE")}
        lastMonthLabel={periodLabel(data.periods.previous, ctx.organization.locale)}
      />
    </>
  );
}
