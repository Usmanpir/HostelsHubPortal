import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { HostelCard } from "@/components/hostels/hostel-card";
import { HostelListToolbar } from "@/components/hostels/hostel-list-toolbar";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { listHostels } from "@/services/hostel/hostel-service";
import { sp, spEnum, spNumber } from "@/lib/page-helpers";

export const metadata = { title: "Hostels" };

export default async function HostelsPage({ searchParams }: PageProps<"/hostels">) {
  const ctx = await requireTenantPage("hostels.view");
  const params = await searchParams;
  const status = spEnum(params, "status", ["ACTIVE", "INACTIVE", "ARCHIVED", "ALL"] as const);
  const data = await listHostels(ctx, { q: sp(params, "q"), status, page: spNumber(params, "page", 1), pageSize: 24 });
  const canManage = can(ctx, "hostels.manage");

  return (
    <>
      <PageHeader
        title="Hostels"
        description="All properties in your organization, with live occupancy."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/hostels/new">
                <Plus />
                Add hostel
              </Link>
            </Button>
          ) : null
        }
      />
      <HostelListToolbar />
      {data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={sp(params, "q") || status ? "No hostels match your filters" : "No hostels yet"}
          description="Add your first hostel to start managing floors, rooms and beds."
          action={
            canManage ? (
              <Button asChild>
                <Link href="/hostels/new">
                  <Plus />
                  Add hostel
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((h) => (
            <HostelCard key={h.id} hostel={h} />
          ))}
        </div>
      )}
    </>
  );
}
