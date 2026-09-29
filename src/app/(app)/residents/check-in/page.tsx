import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { CheckInWizard } from "@/components/residents/check-in-wizard";
import { requireTenantPage } from "@/lib/tenant/server";
import { sp } from "@/lib/page-helpers";
import { todayInTimeZone } from "@/lib/format";
import { getBedPlacement, listAssignableHostels, searchAssignableResidents } from "@/services/resident/assignment-service";

export const metadata = { title: "Check in" };

/** Supports deep links: /residents/check-in?bedId=…&residentId=… */
export default async function CheckInPage({ searchParams }: PageProps<"/residents/check-in">) {
  const ctx = await requireTenantPage("assignments.manage");
  const params = await searchParams;
  const bedId = sp(params, "bedId");
  const residentId = sp(params, "residentId");
  const [hostels, placement, residents] = await Promise.all([
    listAssignableHostels(ctx),
    bedId ? getBedPlacement(ctx, bedId) : Promise.resolve(null),
    residentId ? searchAssignableResidents(ctx, { mode: "check-in", residentId }) : Promise.resolve([]),
  ]);
  const initialPlacement = placement && hostels.some((h) => h.id === placement.hostelId) ? placement : null;

  return (
    <>
      <PageHeader
        title="Check in"
        description="Assign a bed, set the rent and deposit, and optionally bill the first invoice."
        breadcrumbs={[{ label: "Residents", href: "/residents" }, { label: "Check in" }]}
      />
      <SectionTabs group="checkInOut" />
      <CheckInWizard
        key={`${residentId ?? ""}:${bedId ?? ""}`}
        hostels={hostels}
        initialResident={residents[0] ?? null}
        initialPlacement={initialPlacement}
        today={todayInTimeZone(ctx.organization.timezone)}
      />
    </>
  );
}
