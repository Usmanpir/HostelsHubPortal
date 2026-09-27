"use client";

import { useState } from "react";
import { Banknote, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayrollEditDialog, PayrollPayDialog, type PayrollDialogRecord } from "./payroll-dialogs";

/** Edit / pay shortcuts on the payslip page (pending records only). */
export function PayslipActions({ record, today }: { record: PayrollDialogRecord; today: string }) {
  const [dialog, setDialog] = useState<"edit" | "pay" | null>(null);
  const close = (o: boolean) => !o && setDialog(null);
  return (
    <>
      <Button variant="outline" className="no-print" onClick={() => setDialog("edit")}>
        <Pencil />
        Edit
      </Button>
      <Button className="no-print" onClick={() => setDialog("pay")}>
        <Banknote />
        Mark as paid
      </Button>
      {dialog === "edit" ? <PayrollEditDialog record={record} open onOpenChange={close} /> : null}
      {dialog === "pay" ? <PayrollPayDialog record={record} open onOpenChange={close} today={today} /> : null}
    </>
  );
}
