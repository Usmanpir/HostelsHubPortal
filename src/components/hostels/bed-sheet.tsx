"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, LogIn, LogOut, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EnumBadge } from "@/components/shared/status-badge";
import { useCan, useFormatters, useTerms } from "@/components/shared/org-context";
import { bedStatusLabels, bedStatusTones } from "@/config/labels";
import { bedUpdateSchema } from "@/lib/validation/property";
import type { AssignmentStatus, BedStatus } from "@/generated/prisma/enums";
import { archiveBedAction, updateBedAction } from "@/app/(app)/hostels/actions";

export type BedDetail = {
  id: string;
  bedNumber: string;
  status: BedStatus;
  monthlyRent: number | null;
  notes: string | null;
  roomId: string;
  roomNumber: string;
  roomRent: number | null;
  hostelName?: string;
  /** Whole-unit rental: the bed represents the entire unit. */
  wholeUnit?: boolean;
  assignment: {
    id: string;
    status: AssignmentStatus;
    checkInDate: Date;
    monthlyRent: number;
    resident: { id: string; firstName: string; lastName: string; residentCode: string; phone: string };
  } | null;
};

/** Bed details drawer: resident, rent, status editing and quick actions. */
export function BedSheet({ bed, open, onOpenChange }: { bed: BedDetail | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {bed ? <BedSheetBody key={bed.id} bed={bed} close={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function BedSheetBody({ bed, close }: { bed: BedDetail; close: () => void }) {
  const router = useRouter();
  const can = useCan();
  const fmt = useFormatters();
  const t = useTerms();
  const whole = !!bed.wholeUnit;
  const occupied = !!bed.assignment;
  const manageable = can("rooms.manage");

  const { form, onSubmit, pending } = useActionForm({
    schema: bedUpdateSchema,
    defaultValues: {
      bedNumber: bed.bedNumber,
      monthlyRent: bed.monthlyRent ?? undefined,
      notes: bed.notes ?? "",
      status: bed.status,
    },
    action: (v) => updateBedAction(bed.id, v),
    successMessage: whole ? "Unit updated" : "Bed updated",
    onSuccess: () => {
      router.refresh();
      close();
    },
  });

  const statusOptions = occupied
    ? [{ value: bed.status, label: bedStatusLabels[bed.status] }]
    : (["AVAILABLE", "MAINTENANCE", "INACTIVE"] as const).map((s) => ({ value: s, label: bedStatusLabels[s] }));

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {whole ? `Unit ${bed.roomNumber}` : `${t.unit} ${bed.roomNumber} · Bed ${bed.bedNumber}`}
        </SheetTitle>
        <SheetDescription asChild>
          <div className="flex items-center gap-2">
            <EnumBadge value={bed.status} labels={bedStatusLabels} tones={bedStatusTones} />
            {bed.hostelName ? <span>{bed.hostelName}</span> : null}
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-5 px-4 pb-6">
        {bed.assignment ? (
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-info-soft text-info">
                <User className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {bed.assignment.resident.firstName} {bed.assignment.resident.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bed.assignment.resident.residentCode} · {bed.assignment.resident.phone}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{bed.assignment.status === "RESERVED" ? "Reserved from" : t.checkedIn}</dt>
                <dd>{fmt.date(bed.assignment.checkInDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Monthly rent</dt>
                <dd className="tabular">{fmt.money(bed.assignment.monthlyRent)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {can("residents.view") ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/residents/${bed.assignment.resident.id}`}>
                    <User />
                    Profile
                  </Link>
                </Button>
              ) : null}
              {can("assignments.manage") ? (
                <>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/residents/${bed.assignment.resident.id}?transfer=1`}>
                      <ArrowRightLeft />
                      Transfer
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/residents/check-out?residentId=${bed.assignment.resident.id}`}>
                      <LogOut />
                      {t.checkOut}
                    </Link>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : bed.status === "AVAILABLE" && can("assignments.manage") ? (
          <div className="rounded-xl border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">{whole ? "This unit is vacant." : "This bed is free."}</p>
            <p className="mb-3 text-sm">
              Rent: <span className="tabular font-medium">{fmt.money(bed.monthlyRent ?? bed.roomRent ?? 0)}</span>
            </p>
            <Button asChild size="sm">
              <Link href={`/residents/check-in?bedId=${bed.id}`}>
                <LogIn />
                {`${t.checkIn} a ${t.resident.toLowerCase()}`}
              </Link>
            </Button>
          </div>
        ) : null}

        {manageable ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <h4 className="text-sm font-semibold">{whole ? "Unit availability" : "Bed settings"}</h4>
            {whole ? null : <TextField control={form.control} name="bedNumber" label="Bed number" required />}
            <SelectField control={form.control} name="status" label="Status" options={statusOptions} disabled={occupied} description={occupied ? `Status follows ${t.checkIn.toLowerCase()} / ${t.checkOut.toLowerCase()}.` : undefined} />
            <MoneyField control={form.control} name="monthlyRent" label="Monthly rent override" currency={fmt.currency} description={`Leave empty to use the ${t.unit.toLowerCase()} or ${t.property.toLowerCase()} rent.`} />
            <TextareaField control={form.control} name="notes" label="Notes" rows={2} />
            <div className="flex items-center justify-between gap-2">
              {!occupied && !whole ? (
                <ConfirmAction
                  trigger={
                    <Button type="button" variant="ghost" size="sm" className="text-destructive">
                      <Trash2 />
                      Remove bed
                    </Button>
                  }
                  title={`Remove bed ${bed.bedNumber}?`}
                  description="The bed is archived. Its history stays in reports."
                  confirmLabel="Remove"
                  destructive
                  action={() => archiveBedAction(bed.id)}
                  onSuccess={close}
                />
              ) : (
                <span />
              )}
              <SubmitButton pending={pending}>Save</SubmitButton>
            </div>
          </form>
        ) : null}
      </div>
    </>
  );
}
