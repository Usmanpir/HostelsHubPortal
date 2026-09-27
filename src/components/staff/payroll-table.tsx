"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Banknote, FileText, MoreHorizontal, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type Column, type FilterDef } from "@/components/data-table/data-table";
import { EnumBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { paymentMethodLabels, payrollStatusLabels, payrollStatusTones, staffTypeLabels } from "@/config/labels";
import type { PaymentMethod, PayrollStatus, StaffType } from "@/generated/prisma/enums";
import type { Paginated } from "@/lib/validation/common";
import { cancelPayrollAction, generatePayrollAction, reopenPayrollAction } from "@/app/(app)/staff/actions";
import { ControlledConfirm } from "./controlled-confirm";
import { PayrollEditDialog, PayrollPayDialog, type PayrollDialogRecord } from "./payroll-dialogs";

export type PayrollRow = {
  id: string;
  year: number;
  month: number;
  baseSalary: number;
  allowances: number;
  bonus: number;
  deductions: number;
  advances: number;
  netSalary: number;
  status: PayrollStatus;
  paymentDate: Date | null;
  paymentMethod: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  staff: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    designation: StaffType;
    hostels: { hostel: { id: string; name: string } }[];
  };
};

function toDialogRecord(r: PayrollRow, periodLabel: string): PayrollDialogRecord {
  return {
    id: r.id,
    staffName: `${r.staff.firstName} ${r.staff.lastName}`,
    periodLabel,
    baseSalary: r.baseSalary,
    allowances: r.allowances,
    bonus: r.bonus,
    deductions: r.deductions,
    advances: r.advances,
    netSalary: r.netSalary,
    notes: r.notes,
  };
}

function RowActions({ row, periodLabel, today }: { row: PayrollRow; periodLabel: string; today: string }) {
  const can = useCan();
  const manage = can("payroll.manage");
  const [dialog, setDialog] = useState<"edit" | "pay" | "cancel" | "reopen" | null>(null);
  const record = toDialogRecord(row, periodLabel);
  const close = (o: boolean) => !o && setDialog(null);

  return (
    <div className="flex items-center justify-end gap-1.5">
      {manage && row.status === "PENDING" ? (
        <Button size="sm" variant="outline" onClick={() => setDialog("pay")}>
          <Banknote />
          Pay
        </Button>
      ) : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${record.staffName}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/staff/payroll/${row.id}`}>
              <FileText />
              Payslip
            </Link>
          </DropdownMenuItem>
          {manage && row.status === "PENDING" ? (
            <>
              <DropdownMenuItem onSelect={() => setDialog("edit")}>
                <Pencil />
                Edit components
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("cancel")}>
                <Ban />
                Cancel record
              </DropdownMenuItem>
            </>
          ) : null}
          {manage && row.status === "CANCELLED" ? (
            <DropdownMenuItem onSelect={() => setDialog("reopen")}>
              <RotateCcw />
              Reopen
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "edit" ? <PayrollEditDialog record={record} open onOpenChange={close} /> : null}
      {dialog === "pay" ? <PayrollPayDialog record={record} open onOpenChange={close} today={today} /> : null}
      <ControlledConfirm
        open={dialog === "cancel"}
        onOpenChange={close}
        title={`Cancel ${record.staffName}'s ${periodLabel} salary?`}
        description="The record stays for history and can be reopened later."
        confirmLabel="Cancel record"
        destructive
        action={() => cancelPayrollAction(row.id)}
      />
      <ControlledConfirm
        open={dialog === "reopen"}
        onOpenChange={close}
        title="Reopen this salary record?"
        description="It will be set back to Pending so it can be edited and paid."
        confirmLabel="Reopen"
        action={() => reopenPayrollAction(row.id)}
      />
    </div>
  );
}

/** Creates missing salary records for the month (one per eligible staff member). */
export function GeneratePayrollButton({
  year,
  month,
  hostelId,
  eligible,
  periodLabel,
  variant = "default",
}: {
  year: number;
  month: number;
  hostelId: string | null;
  eligible: number;
  periodLabel: string;
  variant?: "default" | "outline";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const run = () =>
    startTransition(async () => {
      try {
        const result = await generatePayrollAction({ year, month, hostelId: hostelId ?? undefined });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const { created, skippedNoSalary } = result.data;
        if (created > 0) toast.success(`Generated ${created} salary record${created === 1 ? "" : "s"} for ${periodLabel}`);
        else toast.info("Everyone already has a salary record for this month");
        if (skippedNoSalary > 0) {
          toast.warning(`${skippedNoSalary} staff member${skippedNoSalary === 1 ? " was" : "s were"} skipped because no salary is set.`);
        }
        router.refresh();
      } catch {
        toast.error("Could not reach the server. Please try again.");
      }
    });
  return (
    <Button variant={variant} onClick={run} disabled={pending || eligible === 0}>
      {pending ? <Spinner /> : <Sparkles />}
      {eligible > 0 ? `Generate for ${eligible} staff` : "All generated"}
    </Button>
  );
}

export function PayrollTable({
  data,
  filters,
  periodLabel,
  today,
  toolbar,
  empty,
}: {
  data: Paginated<PayrollRow>;
  filters: FilterDef[];
  periodLabel: string;
  today: string;
  toolbar?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const fmt = useFormatters();
  const additions = (r: PayrollRow) => r.allowances + r.bonus;
  const subtractions = (r: PayrollRow) => r.deductions + r.advances;

  const columns: Column<PayrollRow>[] = [
    {
      id: "staff",
      header: "Staff",
      hideable: false,
      cell: (r) => (
        <Link href={`/staff/${r.staff.id}`} className="hover:text-primary">
          <span className="block font-medium">
            {r.staff.firstName} {r.staff.lastName}
          </span>
          <span className="block text-xs text-muted-foreground">
            {staffTypeLabels[r.staff.designation]} · <span className="font-mono">{r.staff.employeeCode}</span>
          </span>
        </Link>
      ),
    },
    { id: "hostel", header: "Hostel", defaultHidden: true, cell: (r) => r.staff.hostels[0]?.hostel.name ?? "—" },
    { id: "base", header: "Base", align: "end", cell: (r) => fmt.money(r.baseSalary) },
    {
      id: "additions",
      header: "Allowances + bonus",
      align: "end",
      cell: (r) => (additions(r) ? <span className="text-success">+{fmt.money(additions(r))}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "deductions",
      header: "Deductions",
      align: "end",
      cell: (r) => (subtractions(r) ? <span className="text-danger">−{fmt.money(subtractions(r))}</span> : <span className="text-muted-foreground">—</span>),
    },
    { id: "net", header: "Net salary", align: "end", hideable: false, cell: (r) => <span className="font-semibold">{fmt.money(r.netSalary)}</span> },
    { id: "status", header: "Status", cell: (r) => <EnumBadge value={r.status} labels={payrollStatusLabels} tones={payrollStatusTones} /> },
    {
      id: "paid",
      header: "Paid",
      cell: (r) =>
        r.paymentDate ? (
          <span className="whitespace-nowrap">
            {fmt.date(r.paymentDate)}
            {r.paymentMethod ? <span className="text-xs text-muted-foreground"> · {paymentMethodLabels[r.paymentMethod]}</span> : null}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      hideable: false,
      hideOnMobile: true,
      align: "end",
      cell: (r) => <RowActions row={r} periodLabel={periodLabel} today={today} />,
    },
  ];

  return (
    <DataTable
      rows={data.items}
      columns={columns}
      getRowId={(r) => r.id}
      total={data.total}
      page={data.page}
      pageCount={data.pageCount}
      pageSize={data.pageSize}
      searchPlaceholder="Search staff name or code"
      filters={filters}
      toolbar={toolbar}
      storageKey="payroll"
      empty={empty}
      mobileCard={(r) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/staff/payroll/${r.id}`} className="block truncate font-medium">
                {r.staff.firstName} {r.staff.lastName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {staffTypeLabels[r.staff.designation]} · <span className="font-mono">{r.staff.employeeCode}</span>
              </p>
            </div>
            <EnumBadge value={r.status} labels={payrollStatusLabels} tones={payrollStatusTones} />
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Base {fmt.money(r.baseSalary)}
              {additions(r) ? ` · +${fmt.money(additions(r))}` : ""}
              {subtractions(r) ? ` · −${fmt.money(subtractions(r))}` : ""}
            </div>
            <span className="tabular text-base font-semibold">{fmt.money(r.netSalary)}</span>
          </div>
          <RowActions row={r} periodLabel={periodLabel} today={today} />
        </div>
      )}
    />
  );
}
