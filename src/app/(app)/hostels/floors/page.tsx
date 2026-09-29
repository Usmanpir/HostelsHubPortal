import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { FloorDialog } from "@/components/hostels/floor-dialog";
import { FloorsTable } from "@/components/hostels/floors-table";
import { requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { can } from "@/lib/tenant/context";
import { listFloors } from "@/services/hostel/structure-service";
import { getRentalModeUsage, listHostelOptions } from "@/services/hostel/hostel-service";

export const metadata = { title: "Floors" };

export default async function FloorsPage() {
  const ctx = await requireTenantPage("rooms.view");
  const t = termsFor(ctx.organization.businessType);
  const [floors, hostels, usage] = await Promise.all([listFloors(ctx), listHostelOptions(ctx), getRentalModeUsage(ctx)]);
  const canManage = can(ctx, "rooms.manage") && hostels.length > 0;
  const addButton = canManage ? (
    <FloorDialog
      hostels={hostels}
      defaultHostelId={ctx.activeHostelId}
      trigger={
        <Button>
          <Plus />
          Add floor
        </Button>
      }
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Floors"
        description={
          ctx.activeHostelId
            ? `Floors in the selected ${t.property.toLowerCase()}.`
            : `Floors across all your ${t.properties.toLowerCase()}.`
        }
        breadcrumbs={[{ label: t.properties, href: "/hostels" }, { label: "Floors" }]}
        actions={addButton}
      />
      <SectionTabs group="roomsAndBeds" hide={usage.byBed ? undefined : ["/hostels/beds"]} />
      {floors.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No floors yet"
          description={
            hostels.length
              ? `Add floors to organise ${t.units.toLowerCase()} inside each ${t.property.toLowerCase()}.`
              : `Create a ${t.property.toLowerCase()} first, then add its floors.`
          }
          action={addButton}
        />
      ) : (
        <FloorsTable floors={floors} hostels={hostels} showBeds={usage.byBed} />
      )}
    </>
  );
}
