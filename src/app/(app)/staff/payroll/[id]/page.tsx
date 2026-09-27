import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EnumBadge } from "@/components/shared/status-badge";
import { PrintButton } from "@/components/staff/print-button";
import { PayslipActions } from "@/components/staff/payslip-actions";
import { monthLabel } from "@/components/staff/staff-format";
import { requireTenantPage } from "@/lib/tenant/server";
import { can } from "@/lib/tenant/context";
import { loadOr404 } from "@/lib/page-helpers";
import { formatDate, formatMoney, fullName, todayInTimeZone } from "@/lib/format";
import { employmentTypeLabels, paymentMethodLabels, payrollStatusLabels, payrollStatusTones, staffTypeLabels } from "@/config/labels";
import { getPayslip } from "@/services/staff/payroll-service";
import { grossSalary, totalDeductions } from "@/services/staff/payroll-calc";

export const metadata = { title: "Payslip" };

// Print only the payslip, not the app shell around it.
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  #payslip, #payslip * { visibility: visible !important; }
  #payslip { position: absolute; inset-inline-start: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; }
}`;

export default async function PayslipPage({ params }: PageProps<"/staff/payroll/[id]">) {
  const ctx = await requireTenantPage("payroll.view");
  const { id } = await params;
  const p = await loadOr404(getPayslip(ctx, id));
  const money = (n: number) => formatMoney(n, ctx.organization.currency, ctx.organization.locale);
  const period = monthLabel(p.year, p.month);
  const name = fullName(p.staff);
  const org = p.organization;
  const orgAddress = [org.address, org.city, org.country].filter(Boolean).join(", ");
  const primaryHostel = p.staff.hostels.find((h) => h.isPrimary)?.hostel ?? p.staff.hostels[0]?.hostel;
  const gross = grossSalary(p);
  const deductions = totalDeductions(p);

  const earnings = [
    { label: "Basic salary", amount: p.baseSalary },
    { label: "Allowances", amount: p.allowances },
    { label: "Bonus", amount: p.bonus },
  ];
  const deductionRows = [
    { label: "Deductions", amount: p.deductions },
    { label: "Advances recovered", amount: p.advances },
  ];

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href={`/staff/payroll?month=${p.year}-${String(p.month).padStart(2, "0")}`}>
            <ArrowLeft className="rtl:rotate-180" />
            Payroll
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {can(ctx, "payroll.manage") && p.status === "PENDING" ? (
            <PayslipActions
              today={todayInTimeZone(ctx.organization.timezone)}
              record={{
                id: p.id,
                staffName: name,
                periodLabel: period,
                baseSalary: p.baseSalary,
                allowances: p.allowances,
                bonus: p.bonus,
                deductions: p.deductions,
                advances: p.advances,
                netSalary: p.netSalary,
                notes: p.notes,
              }}
            />
          ) : null}
          <PrintButton label="Print payslip" />
        </div>
      </div>

      <article id="payslip" className="mx-auto max-w-3xl rounded-xl border bg-card p-5 text-sm sm:p-8 print:max-w-none print:p-0">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            {org.logoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${org.logoFileId}`} alt="" className="size-12 rounded-lg object-contain" />
            ) : null}
            <div>
              <p className="text-base font-semibold">{org.brandName || org.name}</p>
              {orgAddress ? <p className="text-muted-foreground">{orgAddress}</p> : null}
              {org.phone || org.email ? (
                <p className="text-muted-foreground">{[org.phone, org.email].filter(Boolean).join(" · ")}</p>
              ) : null}
            </div>
          </div>
          <div className="sm:text-end">
            <p className="text-xl font-semibold tracking-tight">Payslip</p>
            <p className="text-muted-foreground">{period}</p>
            <div className="mt-1.5">
              <EnumBadge value={p.status} labels={payrollStatusLabels} tones={payrollStatusTones} />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-6 gap-y-3 border-b py-5 sm:grid-cols-3">
          <Detail label="Employee" value={name} />
          <Detail label="Employee code" value={<span className="font-mono">{p.staff.employeeCode}</span>} />
          <Detail label="Designation" value={staffTypeLabels[p.staff.designation]} />
          <Detail label="Department" value={p.staff.department ?? "—"} />
          <Detail label="Employment" value={employmentTypeLabels[p.staff.employmentType]} />
          <Detail label="Hostel" value={primaryHostel?.name ?? "—"} />
          <Detail label="Joining date" value={formatDate(p.staff.joiningDate)} />
          <Detail label="Pay period" value={period} />
        </section>

        <section className="grid gap-6 py-5 sm:grid-cols-2">
          <Breakdown title="Earnings" rows={earnings} totalLabel="Gross earnings" total={gross} money={money} />
          <Breakdown title="Deductions" rows={deductionRows} totalLabel="Total deductions" total={deductions} money={money} />
        </section>

        <section className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-4 print:border">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Net pay</p>
            <p className="text-xs text-muted-foreground">Gross earnings − total deductions</p>
          </div>
          <p className="tabular text-2xl font-semibold tracking-tight">{money(p.netSalary)}</p>
        </section>

        {p.status === "PAID" ? (
          <section className="grid grid-cols-2 gap-x-6 gap-y-3 pt-5 sm:grid-cols-3">
            <Detail label="Paid on" value={formatDate(p.paymentDate)} />
            <Detail label="Method" value={p.paymentMethod ? paymentMethodLabels[p.paymentMethod] : "—"} />
            <Detail label="Reference" value={p.reference ?? "—"} />
          </section>
        ) : null}

        {p.notes ? (
          <section className="pt-5">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="whitespace-pre-line">{p.notes}</p>
          </section>
        ) : null}

        <footer className="mt-8 grid grid-cols-2 gap-8 border-t pt-8 text-xs text-muted-foreground">
          <div>
            <div className="mb-1 h-8 border-b border-dashed" />
            Employer signature
          </div>
          <div>
            <div className="mb-1 h-8 border-b border-dashed" />
            Employee signature
          </div>
          <p className="col-span-2 text-center">This is a computer-generated payslip.</p>
        </footer>
      </article>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  totalLabel,
  total,
  money,
}: {
  title: string;
  rows: { label: string; amount: number }[];
  totalLabel: string;
  total: number;
  money: (n: number) => string;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <table className="w-full">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-dashed last:border-b-0">
              <td className="py-1.5">{r.label}</td>
              <td className="tabular py-1.5 text-end">{money(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t">
            <td className="pt-2 font-semibold">{totalLabel}</td>
            <td className="tabular pt-2 text-end font-semibold">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
