"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, ChevronDown, LogIn, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormGrid, SelectField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { useCan, useFormatters } from "@/components/shared/org-context";
import type { UseFormReturn } from "react-hook-form";
import { checkInSchema, residentSchema, type CheckInInput, type ResidentInput, type ResidentValues } from "@/lib/validation/resident";
import { checkInAction, createResidentAction } from "@/app/(app)/residents/actions";
import { WizardShell, ReviewList, type WizardStep } from "./wizard-shell";
import { ResidentSearch, type ResidentPick } from "./resident-search";
import { BedMapPicker, findBed, HostelSelect, MapState, useHostelBedMap, type AssignableHostel } from "./bed-picker";
import { DateInput, MoneyInput, parseMoney, ToggleRow } from "./inputs";

const STEPS: WizardStep[] = [
  { key: "resident", label: "Resident", description: "Search for the resident, or add someone new." },
  { key: "bed", label: "Bed", description: "Tap a green bed to select it." },
  { key: "confirm", label: "Details & confirm" },
];
const RESIDENT = 0;
const BED = 1;
const CONFIRM = 2;

type Placement = { hostelId: string; floorId: string; roomId: string; bedId: string };

export function CheckInWizard({
  hostels,
  initialResident,
  initialPlacement,
  today,
}: {
  hostels: AssignableHostel[];
  initialResident: ResidentPick | null;
  initialPlacement: Placement | null;
  today: string;
}) {
  const router = useRouter();
  const can = useCan();
  const fmt = useFormatters();
  const canInvoice = can("invoices.manage");
  const canCreateResident = can("residents.manage");

  const startStep = initialResident && initialPlacement ? CONFIRM : initialResident ? BED : RESIDENT;
  const [step, setStep] = useState(startStep);
  const [maxReached, setMaxReached] = useState(startStep);
  const [resident, setResident] = useState<ResidentPick | null>(initialResident);
  const [creating, setCreating] = useState(false);
  const singleHostelId = hostels.length === 1 ? hostels[0]!.id : null;
  const [hostelId, setHostelId] = useState<string | null>(
    initialPlacement?.hostelId ?? singleHostelId ?? (initialResident && hostels.some((h) => h.id === initialResident.hostelId) ? initialResident.hostelId : null),
  );
  const [floorId, setFloorId] = useState<string | null>(initialPlacement?.floorId ?? null);
  const [bedId, setBedId] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState(() => String(hostels.find((h) => h.id === hostelId)?.defaultDeposit ?? 0));
  const [date, setDate] = useState(today);
  const [agreement, setAgreement] = useState<UploadedFile | null>(null);
  const [notes, setNotes] = useState("");
  const [reserveOnly, setReserveOnly] = useState(false);
  const [invoice, setInvoice] = useState(canInvoice);
  const [includeRent, setIncludeRent] = useState(true);
  const [includeDeposit, setIncludeDeposit] = useState(true);
  const [includeAdmission, setIncludeAdmission] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Deep link (?bedId=): select the bed once its hostel map has loaded.
  const prefillDone = useRef(!initialPlacement);
  const { map, loading, failed, reload } = useHostelBedMap(hostelId, (loaded) => {
    if (prefillDone.current || !initialPlacement || loaded.hostel.id !== initialPlacement.hostelId) return;
    prefillDone.current = true;
    const found = findBed(loaded, initialPlacement.bedId);
    if (found?.bed.selectable) {
      setBedId(found.bed.id);
      setRent(String(found.bed.rent));
    } else {
      toast.error("That bed is no longer available. Pick another one.");
      setStep((s) => Math.min(s, BED));
    }
  });
  const hostel = hostels.find((h) => h.id === hostelId) ?? null;
  const picked = bedId ? findBed(map, bedId) : null;

  // Inline "New resident" mini-form: creates the resident, then carries on with the check-in.
  const quick = useActionForm({
    schema: residentSchema,
    defaultValues: {
      hostelId: hostelId ?? "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      photoFileId: "",
      status: "ACTIVE",
      joiningDate: today,
    },
    action: createResidentAction,
    onSuccess: (data) => {
      const v = quick.form.getValues();
      setCreating(false);
      quick.form.reset();
      selectResident({
        id: data.id,
        code: data.code,
        name: `${v.firstName.trim()} ${v.lastName.trim()}`,
        phone: v.phone,
        status: "ACTIVE",
        photoFileId: null,
        hostelId: v.hostelId,
        hostelName: hostels.find((h) => h.id === v.hostelId)?.name ?? "",
        placement: null,
      });
      goTo(picked?.bed.selectable ? CONFIRM : BED);
    },
  });

  /** Changing hostel resets the placement; the deposit default follows the hostel. */
  const chooseHostel = (id: string) => {
    if (id === hostelId) return;
    setHostelId(id);
    setFloorId(null);
    setBedId(null);
    setDeposit(String(hostels.find((h) => h.id === id)?.defaultDeposit ?? 0));
  };

  const rentValue = parseMoney(rent);
  const depositValue = parseMoney(deposit);
  const admissionFee = hostel?.admissionFee ?? 0;
  const futureDate = date > today;
  const invoiceOn = canInvoice && invoice;
  const invoiceTotal = invoiceOn
    ? (includeRent ? rentValue || 0 : 0) + (includeDeposit ? depositValue || 0 : 0) + (includeAdmission && admissionFee > 0 ? admissionFee : 0)
    : 0;

  const rentError = Number.isNaN(rentValue) || rentValue < 0 ? "Enter a valid rent." : null;
  const depositError = Number.isNaN(depositValue) || depositValue < 0 ? "Enter a valid deposit." : null;
  const dateError = !date
    ? "Choose a date."
    : futureDate && !reserveOnly
      ? "Future dates are only for reservations. Turn on “Reserve only” under Advanced, or pick today."
      : null;
  // Keep the reservation switch visible when the date needs it.
  const showAdvanced = advancedOpen || (futureDate && !reserveOnly);

  const stepValid = (i: number): string | null => {
    if (i === RESIDENT) return resident ? null : "Select a resident to continue.";
    if (i === BED) {
      if (!hostelId) return "Select a hostel.";
      return picked?.bed.selectable ? null : "Select an available bed.";
    }
    return rentError ?? depositError ?? dateError;
  };

  const goTo = (i: number) => {
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** From the resident step, skip the bed step when a bed is already chosen (deep link). */
  const advanceFromResident = () => goTo(picked?.bed.selectable ? CONFIRM : BED);

  const next = () => {
    const problem = stepValid(step);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (step === RESIDENT) advanceFromResident();
    else goTo(Math.min(step + 1, CONFIRM));
  };

  const selectResident = (r: ResidentPick) => {
    setResident(r);
    if (!hostelId && hostels.some((h) => h.id === r.hostelId)) chooseHostel(r.hostelId);
  };

  const submit = () => {
    for (let i = 0; i <= CONFIRM; i++) {
      const problem = stepValid(i);
      if (problem) {
        toast.error(problem);
        if (i !== step) goTo(i);
        return;
      }
    }
    const payload: CheckInInput = {
      residentId: resident!.id,
      bedId: bedId!,
      checkInDate: date,
      monthlyRent: rentValue,
      securityDeposit: depositValue,
      notes: notes.trim() || undefined,
      agreementFileId: agreement?.id,
      reserveOnly,
      generateInvoice: invoiceOn ? { includeRent, includeDeposit, includeAdmissionFee: includeAdmission && admissionFee > 0 } : undefined,
    };
    const parsed = checkInSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the details.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await checkInAction(payload);
        if (!res.ok) {
          toast.error(res.error);
          if (res.code === "BUSINESS_RULE" || res.code === "CONFLICT") reload();
          return;
        }
        toast.success(res.data.status === "RESERVED" ? `Bed reserved for ${resident!.name}` : `${resident!.name} checked in`, {
          action:
            res.data.invoiceId && can("invoices.view")
              ? { label: "View invoice", onClick: () => router.push(`/finance/invoices/${res.data.invoiceId}`) }
              : undefined,
        });
        router.push(`/residents/${res.data.residentId}`);
        router.refresh();
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    });
  };

  const placementLabel = picked ? `${picked.floor.name} · Room ${picked.room.roomNumber} · Bed ${picked.bed.bedNumber}` : "—";

  return (
    <WizardShell
      steps={STEPS}
      current={step}
      maxReached={maxReached}
      onStepClick={goTo}
      title={resident ? resident.name : "Check in"}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={() => (step === RESIDENT ? router.back() : goTo(step - 1))} disabled={pending}>
            <ArrowLeft className="rtl:rotate-180" />
            {step === RESIDENT ? "Cancel" : "Back"}
          </Button>
          {step === CONFIRM ? (
            <Button onClick={submit} disabled={pending || (!picked && loading)} size="lg" className="flex-1 sm:flex-none">
              {pending ? <Spinner /> : reserveOnly ? <CalendarClock /> : <LogIn />}
              {reserveOnly ? "Reserve bed" : "Check in"}
            </Button>
          ) : step === RESIDENT && creating ? (
            <Button type="submit" form="quick-resident" size="lg" className="flex-1 sm:flex-none" disabled={quick.pending}>
              {quick.pending ? <Spinner /> : null}
              Add & continue
              {quick.pending ? null : <ArrowRight className="rtl:rotate-180" />}
            </Button>
          ) : (
            <Button onClick={next} size="lg" className="flex-1 sm:flex-none" disabled={step === BED && loading}>
              Continue
              <ArrowRight className="rtl:rotate-180" />
            </Button>
          )}
        </>
      }
    >
      {step === RESIDENT ? (
        creating ? (
          <QuickResidentForm hostels={hostels} form={quick.form} onSubmit={quick.onSubmit} pending={quick.pending} onCancel={() => setCreating(false)} />
        ) : (
          <div className="flex flex-col gap-4">
            {canCreateResident ? (
              <Button
                variant="outline"
                size="lg"
                className="self-start"
                onClick={() => {
                  if (!quick.form.getValues("hostelId") && hostelId) quick.form.setValue("hostelId", hostelId);
                  setCreating(true);
                }}
              >
                <UserPlus />
                New resident
              </Button>
            ) : null}
            <ResidentSearch mode="check-in" selected={resident} onSelect={selectResident} />
          </div>
        )
      ) : null}

      {step === BED ? (
        <div className="flex flex-col gap-4">
          {hostels.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              There are no active hostels you can place residents in.
            </p>
          ) : hostels.length > 1 ? (
            <div className="max-w-sm">
              <HostelSelect hostels={hostels} value={hostelId} onChange={chooseHostel} />
            </div>
          ) : null}
          {hostelId ? (
            !map || loading ? (
              <MapState failed={failed} onRetry={reload} />
            ) : (
              <BedMapPicker
                map={map}
                floorId={floorId}
                onFloorChange={setFloorId}
                value={bedId}
                onChange={(b) => {
                  setBedId(b.id);
                  setRent(String(b.rent));
                }}
              />
            )
          ) : null}
        </div>
      ) : null}

      {step === CONFIRM ? (
        !picked ? (
          loading || failed ? (
            <MapState failed={failed} onRetry={reload} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              <p>Choose a bed first.</p>
              <Button variant="outline" onClick={() => goTo(BED)}>
                Choose a bed
              </Button>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-5">
            <ReviewList
              items={[
                {
                  label: "Resident",
                  value: (
                    <button type="button" className="text-end underline-offset-4 hover:underline" onClick={() => goTo(RESIDENT)}>
                      {resident ? `${resident.name}${resident.code ? ` (${resident.code})` : ""}` : "—"}
                    </button>
                  ),
                },
                {
                  label: "Bed",
                  value: (
                    <button type="button" className="text-end underline-offset-4 hover:underline" onClick={() => goTo(BED)}>
                      {hostels.length > 1 && hostel ? `${hostel.name} · ` : ""}
                      {placementLabel}
                    </button>
                  ),
                },
              ]}
            />

            <FormGrid className="sm:grid-cols-3">
              <DateInput
                id="checkin-date"
                label={reserveOnly ? "Move-in date" : "Check-in date"}
                value={date}
                onChange={setDate}
                max={reserveOnly ? undefined : today}
                error={dateError ?? undefined}
              />
              <MoneyInput id="checkin-rent" label="Monthly rent" currency={fmt.currency} value={rent} onChange={setRent} error={rentError ?? undefined} />
              <MoneyInput
                id="checkin-deposit"
                label="Security deposit"
                currency={fmt.currency}
                value={deposit}
                onChange={setDeposit}
                error={depositError ?? undefined}
              />
            </FormGrid>

            {canInvoice ? (
              <ToggleRow
                id="checkin-invoice"
                label="Generate first invoice"
                description={invoice ? `${fmt.money(invoiceTotal)} before tax` : undefined}
                checked={invoice}
                onChange={setInvoice}
                className="min-h-14"
              />
            ) : null}

            <Collapsible open={showAdvanced} onOpenChange={setAdvancedOpen} className="rounded-xl border">
              <CollapsibleTrigger className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-start text-sm font-medium hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <span>
                  Advanced
                  {!showAdvanced ? (
                    <span className="block text-xs font-normal text-muted-foreground">Reserve only, notes, agreement{invoiceOn ? ", invoice items" : ""}</span>
                  ) : null}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-4 border-t px-4 py-4">
                <ToggleRow
                  id="checkin-reserve"
                  label="Reserve only"
                  description="Hold the bed now; check the resident in when they arrive."
                  checked={reserveOnly}
                  onChange={setReserveOnly}
                />
                {invoiceOn ? (
                  <fieldset className="grid gap-3">
                    <legend className="mb-2 text-sm font-medium">Bill on the first invoice</legend>
                    <CheckRow id="inv-rent" label={`First month's rent · ${fmt.money(rentValue || 0)}`} checked={includeRent} onChange={setIncludeRent} />
                    <CheckRow id="inv-deposit" label={`Security deposit · ${fmt.money(depositValue || 0)}`} checked={includeDeposit} onChange={setIncludeDeposit} />
                    {admissionFee > 0 ? (
                      <CheckRow id="inv-admission" label={`Admission fee · ${fmt.money(admissionFee)}`} checked={includeAdmission} onChange={setIncludeAdmission} />
                    ) : null}
                  </fieldset>
                ) : null}
                <div className="grid gap-2">
                  <Label>Signed agreement</Label>
                  <FileUpload purpose="assignment-document" value={agreement} onChange={setAgreement} label="Upload agreement" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="checkin-notes">Notes</Label>
                  <Textarea id="checkin-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the team should know about this stay" maxLength={1000} />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="rounded-xl bg-muted/40 p-4 text-sm">
              <p>
                {reserveOnly ? "Reserve " : "Check in "}
                <span className="font-medium">{resident?.name ?? "—"}</span> to <span className="font-medium">{placementLabel}</span>{" "}
                {reserveOnly ? "from" : "on"} <span className="font-medium">{date ? fmt.date(date) : "—"}</span>.
              </p>
              <p className="mt-1 text-muted-foreground">
                Rent <span className="tabular text-foreground">{fmt.money(rentValue || 0)}</span>/month · deposit{" "}
                <span className="tabular text-foreground">{fmt.money(depositValue || 0)}</span>
                {canInvoice ? (
                  <>
                    {" · "}
                    {invoiceOn && invoiceTotal > 0 ? (
                      <>
                        first invoice <span className="tabular text-foreground">{fmt.money(invoiceTotal)}</span> + tax
                      </>
                    ) : (
                      "no invoice now"
                    )}
                  </>
                ) : null}
              </p>
            </div>
          </div>
        )
      ) : null}
    </WizardShell>
  );
}

function CheckRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-10 items-center gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

/** Minimal "new resident" form inside the check-in flow; the full profile can be completed later. */
function QuickResidentForm({
  hostels,
  form,
  onSubmit,
  pending,
  onCancel,
}: {
  hostels: AssignableHostel[];
  form: UseFormReturn<ResidentInput, unknown, ResidentValues>;
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  pending: boolean;
  onCancel: () => void;
}) {
  const c = form.control;
  return (
    <form id="quick-resident" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">New resident</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          <X />
          Search instead
        </Button>
      </div>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <TextField control={c} name="firstName" label="First name" required autoComplete="off" />
        <TextField control={c} name="lastName" label="Last name" required autoComplete="off" />
        <TextField control={c} name="phone" label="Phone" type="tel" required inputMode="tel" placeholder="+92 300 1234567" />
        {hostels.length !== 1 ? (
          <SelectField control={c} name="hostelId" label="Hostel" required options={hostels.map((h) => ({ value: h.id, label: h.name }))} />
        ) : null}
      </fieldset>
      <p className="text-xs text-muted-foreground">Add the rest of the profile later from the resident page.</p>
    </form>
  );
}
