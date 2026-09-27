"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { useCan, useFormatters } from "@/components/shared/org-context";
import { checkInSchema, type CheckInInput } from "@/lib/validation/resident";
import { checkInAction } from "@/app/(app)/residents/actions";
import { WizardShell, ReviewList, type WizardStep } from "./wizard-shell";
import { ResidentSearch, type ResidentPick } from "./resident-search";
import {
  BedChoices,
  findBed,
  FloorChoices,
  HostelChoices,
  MapState,
  RoomChoices,
  useHostelBedMap,
  type AssignableHostel,
} from "./bed-picker";
import { DateInput, MoneyInput, parseMoney, ToggleRow } from "./inputs";

const STEPS: WizardStep[] = [
  { key: "resident", label: "Resident", description: "Who is moving in? Search existing residents or register someone new." },
  { key: "hostel", label: "Hostel", description: "Choose the property." },
  { key: "floor", label: "Floor", description: "Floors with free beds are selectable." },
  { key: "room", label: "Room", description: "Pick a room with space." },
  { key: "bed", label: "Bed", description: "Green beds are available." },
  { key: "rent", label: "Monthly rent", description: "Defaults to the bed, room or hostel rent. Adjust for this resident if needed." },
  { key: "deposit", label: "Security deposit", description: "Refundable amount held for this stay." },
  { key: "date", label: "Check-in date" },
  { key: "extras", label: "Agreement & billing", description: "Attach the signed agreement and choose what to bill now." },
  { key: "review", label: "Review & confirm" },
];

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

  const startStep = initialResident && initialPlacement ? 5 : initialResident ? 1 : 0;
  const [step, setStep] = useState(startStep);
  const [maxReached, setMaxReached] = useState(startStep);
  const [resident, setResident] = useState<ResidentPick | null>(initialResident);
  const [hostelId, setHostelId] = useState<string | null>(initialPlacement?.hostelId ?? (hostels.length === 1 ? hostels[0]!.id : null));
  const [floorId, setFloorId] = useState<string | null>(initialPlacement?.floorId ?? null);
  const [roomId, setRoomId] = useState<string | null>(initialPlacement?.roomId ?? null);
  const [bedId, setBedId] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState(() => {
    const initial = hostels.find((h) => h.id === (initialPlacement?.hostelId ?? (hostels.length === 1 ? hostels[0]!.id : null)));
    return initial ? String(initial.defaultDeposit ?? 0) : "";
  });
  const [date, setDate] = useState(today);
  const [agreement, setAgreement] = useState<UploadedFile | null>(null);
  const [notes, setNotes] = useState("");
  const [reserveOnly, setReserveOnly] = useState(false);
  const [invoice, setInvoice] = useState(canInvoice);
  const [includeRent, setIncludeRent] = useState(true);
  const [includeDeposit, setIncludeDeposit] = useState(true);
  const [includeAdmission, setIncludeAdmission] = useState(true);
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
      setStep((s) => Math.min(s, 4));
    }
  });
  const hostel = hostels.find((h) => h.id === hostelId) ?? null;
  const floor = map?.floors.find((f) => f.id === floorId) ?? null;
  const room = floor?.rooms.find((r) => r.id === roomId) ?? null;
  const picked = bedId ? findBed(map, bedId) : null;

  /** Changing hostel resets the placement; the deposit default follows the hostel. */
  const chooseHostel = (id: string) => {
    if (id === hostelId) return;
    setHostelId(id);
    setFloorId(null);
    setRoomId(null);
    setBedId(null);
    setDeposit(String(hostels.find((h) => h.id === id)?.defaultDeposit ?? 0));
  };

  const rentValue = parseMoney(rent);
  const depositValue = parseMoney(deposit);
  const admissionFee = hostel?.admissionFee ?? 0;
  const futureDate = date > today;

  const invoiceTotal =
    invoice && canInvoice
      ? (includeRent ? rentValue || 0 : 0) + (includeDeposit ? depositValue || 0 : 0) + (includeAdmission ? admissionFee : 0)
      : 0;

  const stepValid = (i: number): string | null => {
    switch (STEPS[i]!.key) {
      case "resident":
        return resident ? null : "Select a resident to continue.";
      case "hostel":
        return hostelId ? null : "Select a hostel.";
      case "floor":
        return floor ? null : "Select a floor.";
      case "room":
        return room ? null : "Select a room.";
      case "bed":
        return picked?.bed.selectable ? null : "Select an available bed.";
      case "rent":
        return Number.isNaN(rentValue) || rentValue < 0 ? "Enter a valid rent." : null;
      case "deposit":
        return Number.isNaN(depositValue) || depositValue < 0 ? "Enter a valid deposit." : null;
      case "date":
        if (!date) return "Choose a date.";
        return futureDate && !reserveOnly ? "Future dates are only allowed for reservations. Turn on “Reserve only” or pick today." : null;
      default:
        return null;
    }
  };

  const goTo = (i: number) => {
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => {
    const problem = stepValid(step);
    if (problem) {
      toast.error(problem);
      return;
    }
    goTo(Math.min(step + 1, STEPS.length - 1));
  };

  const submit = () => {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const problem = stepValid(i);
      if (problem) {
        toast.error(problem);
        goTo(i);
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
      generateInvoice:
        canInvoice && invoice ? { includeRent, includeDeposit, includeAdmissionFee: includeAdmission && admissionFee > 0 } : undefined,
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

  const newResidentHref = `/residents/new?returnTo=check-in${bedId ?? initialPlacement?.bedId ? `&bedId=${bedId ?? initialPlacement?.bedId}` : ""}`;
  const key = STEPS[step]!.key;
  const needsMap = ["floor", "room", "bed"].includes(key);

  return (
    <WizardShell
      steps={STEPS}
      current={step}
      maxReached={maxReached}
      onStepClick={goTo}
      title={resident ? resident.name : "Check in"}
      footer={
        <>
          <Button variant="ghost" onClick={() => (step === 0 ? router.back() : goTo(step - 1))} disabled={pending}>
            <ArrowLeft className="rtl:rotate-180" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {key === "review" ? (
            <Button onClick={submit} disabled={pending} size="lg">
              {pending ? <Spinner /> : reserveOnly ? <CalendarClock /> : <LogIn />}
              {reserveOnly ? "Confirm reservation" : "Confirm check-in"}
            </Button>
          ) : (
            <Button onClick={next} size="lg" disabled={needsMap && loading}>
              Continue
              <ArrowRight className="rtl:rotate-180" />
            </Button>
          )}
        </>
      }
    >
      {key === "resident" ? (
        <div className="flex flex-col gap-4">
          <ResidentSearch
            mode="check-in"
            selected={resident}
            onSelect={(r) => {
              setResident(r);
              if (!hostelId && hostels.some((h) => h.id === r.hostelId)) chooseHostel(r.hostelId);
            }}
          />
          {canCreateResident ? (
            <Button asChild variant="outline" className="self-start">
              <Link href={newResidentHref}>
                <UserPlus />
                Register a new resident
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {key === "hostel" ? (
        hostels.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            There are no active hostels you can place residents in.
          </p>
        ) : (
          <HostelChoices
            hostels={hostels}
            value={hostelId}
            onChange={chooseHostel}
          />
        )
      ) : null}

      {needsMap && (!map || loading) ? <MapState failed={failed} onRetry={reload} /> : null}

      {key === "floor" && map && !loading ? (
        <FloorChoices
          floors={map.floors}
          value={floorId}
          onChange={(id) => {
            if (id === floorId) return;
            setFloorId(id);
            setRoomId(null);
            setBedId(null);
          }}
        />
      ) : null}

      {key === "room" && map && !loading ? (
        floor ? (
          <RoomChoices
            rooms={floor.rooms}
            value={roomId}
            onChange={(id) => {
              if (id === roomId) return;
              setRoomId(id);
              setBedId(null);
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Go back and choose a floor.</p>
        )
      ) : null}

      {key === "bed" && map && !loading ? (
        room ? (
          <BedChoices
            room={room}
            value={bedId}
            onChange={(b) => {
              setBedId(b.id);
              setRent(String(b.rent));
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Go back and choose a room.</p>
        )
      ) : null}

      {key === "rent" ? (
        <div className="flex max-w-sm flex-col gap-3">
          <MoneyInput
            id="checkin-rent"
            label="Monthly rent"
            currency={fmt.currency}
            value={rent}
            onChange={setRent}
            autoFocus
            error={stepValid(step) ?? undefined}
            description={picked ? `Default for Room ${picked.room.roomNumber} · Bed ${picked.bed.bedNumber}: ${fmt.money(picked.bed.rent)}` : undefined}
          />
        </div>
      ) : null}

      {key === "deposit" ? (
        <div className="flex max-w-sm flex-col gap-3">
          <MoneyInput
            id="checkin-deposit"
            label="Security deposit"
            currency={fmt.currency}
            value={deposit}
            onChange={setDeposit}
            autoFocus
            error={stepValid(step) ?? undefined}
            description={hostel ? `Hostel default: ${fmt.money(hostel.defaultDeposit ?? 0)}` : undefined}
          />
        </div>
      ) : null}

      {key === "date" ? (
        <div className="flex max-w-sm flex-col gap-4">
          <DateInput
            id="checkin-date"
            label={reserveOnly ? "Move-in date" : "Check-in date"}
            value={date}
            onChange={setDate}
            max={reserveOnly ? undefined : today}
            error={stepValid(step) ?? undefined}
          />
          <ToggleRow
            id="checkin-reserve"
            label="Reserve only"
            description="Hold the bed now; check the resident in when they arrive."
            checked={reserveOnly}
            onChange={setReserveOnly}
          />
        </div>
      ) : null}

      {key === "extras" ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label>Signed agreement</Label>
            <FileUpload purpose="assignment-document" value={agreement} onChange={setAgreement} label="Upload agreement" />
            <p className="text-xs text-muted-foreground">Saved to the resident&apos;s documents as an agreement.</p>
          </div>
          {canInvoice ? (
            <div className="flex flex-col gap-2">
              <ToggleRow
                id="checkin-invoice"
                label="Generate first invoice"
                description="Creates an invoice for the selected charges right away."
                checked={invoice}
                onChange={setInvoice}
              />
              {invoice ? (
                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
                  <ToggleRow id="inv-rent" label={`First month's rent · ${fmt.money(rentValue || 0)}`} checked={includeRent} onChange={setIncludeRent} className="bg-card" />
                  <ToggleRow id="inv-deposit" label={`Security deposit · ${fmt.money(depositValue || 0)}`} checked={includeDeposit} onChange={setIncludeDeposit} className="bg-card" />
                  {admissionFee > 0 ? (
                    <ToggleRow id="inv-admission" label={`Admission fee · ${fmt.money(admissionFee)}`} checked={includeAdmission} onChange={setIncludeAdmission} className="bg-card" />
                  ) : null}
                  <p className="px-1 text-sm">
                    Invoice total before tax: <span className="tabular font-semibold">{fmt.money(invoiceTotal)}</span>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="checkin-notes">Notes</Label>
            <Textarea id="checkin-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the team should know about this stay" maxLength={1000} />
          </div>
        </div>
      ) : null}

      {key === "review" ? (
        <div className="flex flex-col gap-4">
          {reserveOnly ? (
            <p className="rounded-lg bg-violet-soft px-3 py-2 text-sm text-violet">
              The bed will be reserved. Check the resident in from their profile when they arrive.
            </p>
          ) : null}
          <ReviewList
            items={[
              { label: "Resident", value: resident ? `${resident.name} (${resident.code})` : "—" },
              { label: "Hostel", value: hostel?.name ?? "—" },
              { label: "Bed", value: picked ? `${picked.floor.name} · Room ${picked.room.roomNumber} · Bed ${picked.bed.bedNumber}` : "—" },
              { label: "Monthly rent", value: <span className="tabular">{fmt.money(rentValue || 0)}</span> },
              { label: "Security deposit", value: <span className="tabular">{fmt.money(depositValue || 0)}</span> },
              { label: reserveOnly ? "Move-in date" : "Check-in date", value: fmt.date(date) },
              { label: "Agreement", value: agreement ? agreement.name : "Not attached" },
              ...(canInvoice
                ? [{ label: "First invoice", value: invoice && invoiceTotal > 0 ? <span className="tabular">{fmt.money(invoiceTotal)} + tax</span> : "Not created" }]
                : []),
            ]}
          />
          {notes.trim() ? <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{notes}</p> : null}
        </div>
      ) : null}
    </WizardShell>
  );
}
