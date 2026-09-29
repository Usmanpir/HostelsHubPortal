import { PageHeader } from "@/components/shared/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { CheckOutWizard } from "@/components/residents/check-out-wizard";
import { getTenantContext, requireTenantPage } from "@/lib/tenant/server";
import { termsFor } from "@/lib/terms";
import { sp } from "@/lib/page-helpers";
import { todayInTimeZone } from "@/lib/format";
import { NotFoundError } from "@/lib/errors";
import { getCheckOutPreview, searchAssignableResidents } from "@/services/resident/assignment-service";

export async function generateMetadata() {
  const ctx = await getTenantContext();
  return { title: termsFor(ctx?.organization.businessType).checkOut };
}

/** Supports deep links: /residents/check-out?residentId=… */
export default async function CheckOutPage({ searchParams }: PageProps<"/residents/check-out">) {
  const ctx = await requireTenantPage("assignments.manage");
  const params = await searchParams;
  const residentId = sp(params, "residentId");
  const [residents, preview] = residentId
    ? await Promise.all([
        searchAssignableResidents(ctx, { mode: "check-out", residentId }),
        getCheckOutPreview(ctx, residentId).catch((error: unknown) => {
          // No active stay (already checked out, or not accessible): start at the picker.
          if (error instanceof NotFoundError) return null;
          throw error;
        }),
      ])
    : [[], null];
  const t = termsFor(ctx.organization.businessType);

  return (
    <>
      <PageHeader
        title={t.checkOut}
        description={
          t.property === "Hostel"
            ? "Settle the stay, deposit and final charges, then free the bed."
            : "Settle the lease, deposit and final charges, then free the unit."
        }
        breadcrumbs={[{ label: t.residents, href: "/residents" }, { label: t.checkOut }]}
      />
      <SectionTabs group="checkInOut" />
      <CheckOutWizard
        key={residentId ?? ""}
        initialResident={preview ? (residents[0] ?? null) : null}
        initialPreview={preview}
        today={todayInTimeZone(ctx.organization.timezone)}
      />
    </>
  );
}
