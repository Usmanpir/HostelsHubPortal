import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { HostelCard } from "@/components/hostels/hostel-card";
import { HostelListToolbar } from "@/components/hostels/hostel-list-toolbar";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { can } from "@/lib/tenant/context";
import { listHostels } from "@/services/hostel/hostel-service";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: termsFor(ctx?.organization.businessType).properties };
}

export default async function HostelsPage({ searchParams }: PageProps<"/hostels">) {
  const ctx = await requireTenantPage("hostels.view");
  const params = await searchParams;
  const status = spEnum(params, "status", ["ACTIVE", "INACTIVE", "ARCHIVED", "ALL"] as const);
  const data = await listHostels(ctx, { q: sp(params, "q"), status, page: spNumber(params, "page", 1), pageSize: 24 });
  const canManage = can(ctx, "hostels.manage");
  const t = termsFor(ctx.organization.businessType);
  const property = t.property.toLowerCase();
  const properties = t.properties.toLowerCase();
  const hostelOrg = ctx.organization.businessType === "HOSTELS";

  return (
    <>
      <PageHeader
        title={t.properties}
        description="All properties in your organization, with live occupancy."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/hostels/new">
                <Plus />
                Add {property}
              </Link>
            </Button>
          ) : null
        }
      />
      <HostelListToolbar />
      {data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={sp(params, "q") || status ? `No ${properties} match your filters` : `No ${properties} yet`}
          description={
            hostelOrg
              ? "Add your first hostel to start managing floors, rooms and beds."
              : `Add your first ${property} to start managing floors and ${t.units.toLowerCase()}.`
          }
          action={
            canManage ? (
              <Button asChild>
                <Link href="/hostels/new">
                  <Plus />
                  Add {property}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((h) => (
            <HostelCard key={h.id} hostel={h} terms={t} />
          ))}
        </div>
      )}
    </>
  );
}
