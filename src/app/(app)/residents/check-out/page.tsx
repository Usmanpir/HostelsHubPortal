import { PageHeader } from "@/components/shared/page-header";
import { CheckOutWizard } from "@/components/residents/check-out-wizard";
import { requireTenantPage } from "@/lib/tenant/server";
import { sp } from "@/lib/page-helpers";
import { todayInTimeZone } from "@/lib/format";
import { NotFoundError } from "@/lib/errors";
import { getCheckOutPreview, searchAssignableResidents } from "@/services/resident/assignment-service";

export const metadata = { title: "Check out" };

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

  return (
    <>
      <PageHeader
        title="Check out"
        description="Settle the stay, deposit and final charges, then free the bed."
        breadcrumbs={[{ label: "Residents", href: "/residents" }, { label: "Check out" }]}
      />
      <CheckOutWizard
        key={residentId ?? ""}
        initialResident={preview ? (residents[0] ?? null) : null}
        initialPreview={preview}
        today={todayInTimeZone(ctx.organization.timezone)}
      />
    </>
  );
}
