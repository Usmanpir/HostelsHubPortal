import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InvoiceForm } from "@/components/finance/invoice-form";
import { requireTenantPage } from "@/lib/tenant/server";
import { loadOr404 } from "@/lib/page-helpers";
import { toDateInput } from "@/lib/format";
import { getInvoiceForEdit, getInvoiceFormDefaults } from "@/services/finance/invoice-service";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: PageProps<"/finance/invoices/[id]/edit">) {
  const ctx = await requireTenantPage("invoices.manage");
  const { id } = await params;
  const [invoice, defaults] = await Promise.all([loadOr404(getInvoiceForEdit(ctx, id)), getInvoiceFormDefaults(ctx)]);
  const breadcrumbs = [
    { label: "Invoices", href: "/finance/invoices" },
    { label: invoice.invoiceNumber, href: `/finance/invoices/${invoice.id}` },
    { label: "Edit" },
  ];

  if (!invoice.editable || (invoice.status !== "DRAFT" && invoice.status !== "PENDING" && invoice.status !== "OVERDUE")) {
    return (
      <>
        <PageHeader title={`Edit ${invoice.invoiceNumber}`} breadcrumbs={breadcrumbs} />
        <EmptyState
          icon={Lock}
          title="This invoice can no longer be edited"
          description="Only drafts and unpaid invoices without payments can be changed. Void its payments or cancel it and issue a new one."
          action={
            <Button asChild variant="outline">
              <Link href={`/finance/invoices/${invoice.id}`}>Back to invoice</Link>
            </Button>
          }
        />
      </>
    );
  }

  const taxApplied = invoice.taxRate > 0;
  return (
    <>
      <PageHeader
        title={`Edit ${invoice.invoiceNumber}`}
        description={invoice.status === "DRAFT" ? "Drafts aren't visible to the resident until issued." : "Changes are visible to the resident immediately."}
        breadcrumbs={breadcrumbs}
      />
      <InvoiceForm
        invoiceId={invoice.id}
        currentStatus={invoice.status}
        taxRate={taxApplied ? invoice.taxRate : defaults.taxRate}
        taxLabel={defaults.taxLabel}
        invoiceDueDays={defaults.invoiceDueDays}
        today={defaults.today}
        initialResident={{
          id: invoice.resident.id,
          name: `${invoice.resident.firstName} ${invoice.resident.lastName}`.trim(),
          code: invoice.resident.residentCode,
        }}
        initial={{
          residentId: invoice.residentId,
          assignmentId: invoice.assignmentId ?? "",
          issueDate: toDateInput(invoice.issueDate),
          dueDate: toDateInput(invoice.dueDate),
          periodStart: toDateInput(invoice.periodStart),
          periodEnd: toDateInput(invoice.periodEnd),
          items: invoice.items.map((i) => ({ type: i.type, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
          discount: invoice.discount,
          applyTax: taxApplied,
          notes: invoice.notes ?? "",
          status: invoice.status === "DRAFT" ? "DRAFT" : "PENDING",
        }}
      />
    </>
  );
}
