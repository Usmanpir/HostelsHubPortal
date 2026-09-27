import { PageHeader } from "@/components/shared/page-header";
import { PaymentForm } from "@/components/finance/payment-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { sp } from "@/lib/page-helpers";
import { todayInTimeZone } from "@/lib/format";
import { getPaymentPrefill } from "@/services/finance/billing-residents";

export const metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: PageProps<"/finance/payments/new">) {
  const ctx = await requireTenantPage("payments.manage");
  const params = await searchParams;
  const prefill = await getPaymentPrefill(ctx, { invoiceId: sp(params, "invoiceId"), residentId: sp(params, "residentId") });

  return (
    <>
      <PageHeader
        title="Record payment"
        description="Apply a payment to an invoice or keep it as advance credit. A receipt is created automatically."
        breadcrumbs={[{ label: "Payments", href: "/finance/payments" }, { label: "Record payment" }]}
      />
      <PaymentForm today={todayInTimeZone(ctx.organization.timezone)} initialInvoiceId={prefill.invoiceId} initialResident={prefill.resident} />
    </>
  );
}
