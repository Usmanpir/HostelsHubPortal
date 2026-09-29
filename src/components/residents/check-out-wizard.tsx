"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, LogOut, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileUpload, type UploadedFile } from "@/components/shared/file-upload";
import { useFormatters } from "@/components/shared/org-context";
import { chargeTypeLabels, optionsFrom, paymentMethodLabels } from "@/config/labels";
import type { ChargeType, PaymentMethod } from "@/generated/prisma/enums";
import { checkOutSchema, type CheckOutInput } from "@/lib/validation/resident";
import { cn } from "@/lib/utils";
import { toDateInput } from "@/lib/format";
import type { getCheckOutPreview } from "@/services/resident/assignment-service";
import { checkOutAction, checkOutPreviewAction } from "@/app/(app)/residents/actions";
import { WizardShell, type WizardStep } from "./wizard-shell";
import { ResidentSearch, type ResidentPick } from "./resident-search";
import { DateInput, MoneyInput, parseMoney } from "./inputs";
import { ResidentAvatar } from "./resident-avatar";

export type CheckOutPreview = Awaited<ReturnType<typeof getCheckOutPreview>>;

const STEPS: WizardStep[] = [
  { key: "resident", label: "Resident", description: "Only residents with an active stay are listed." },
  { key: "settle", label: "Settle & confirm" },
];
const RESIDENT = 0;
const SETTLE = 1;

type Charge = { key: number; type: ChargeType; description: string; amount: string };

const FINAL_CHARGE_TYPES: ChargeType[] = ["ELECTRICITY", "GAS", "INTERNET", "MESS", "LAUNDRY", "MAINTENANCE", "MONTHLY_RENT", "LATE_FEE", "OTHER"];

export function CheckOutWizard({
  initialResident,
  initialPreview,
  today,
}: {
  initialResident: ResidentPick | null;
  initialPreview: CheckOutPreview | null;
  today: string;
}) {
  const router = useRouter();
  const fmt = useFormatters();
  const start = initialPreview ? SETTLE : RESIDENT;
  const [step, setStep] = useState(start);
  const [maxReached, setMaxReached] = useState(start);
  const [resident, setResident] = useState<ResidentPick | null>(initialResident);
  const [preview, setPreview] = useState<CheckOutPreview | null>(initialPreview);
  const [loadingPreview, startPreview] = useTransition();
  const [date, setDate] = useState(today);
  const [meter, setMeter] = useState("");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [deduction, setDeduction] = useState("0");
  /** null = follow "deposit − deduction"; set once the user types a refund. */
  const [refundOverride, setRefundOverride] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [clearance, setClearance] = useState<UploadedFile | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const deposit = preview?.assignment.securityDeposit ?? 0;
  const chargesTotal = charges.reduce((s, c) => s + (parseMoney(c.amount) || 0), 0);
  const dues = Math.max(0, (preview?.balance.balance ?? 0) + chargesTotal);
  const deductionValue = parseMoney(deduction);
  const refund = refundOverride ?? String(Math.max(0, Math.round((deposit - (deductionValue || 0)) * 100) / 100));
  const refundValue = parseMoney(refund);
  const depositError =
    Number.isNaN(deductionValue) || Number.isNaN(refundValue)
      ? "Enter valid amounts."
      : Math.round((deductionValue + refundValue) * 100) > Math.round(deposit * 100)
        ? `Deduction and refund together can't exceed the deposit of ${fmt.money(deposit)}.`
        : null;
  const dateError = !date
    ? "Choose the check-out date."
    : date > today
      ? "Check-out can't be in the future."
      : preview && date < toDateInput(preview.assignment.checkInDate)
        ? "Check-out must be on or after the check-in date."
        : null;
  const chargesError = charges.some((c) => !c.description.trim() || !(parseMoney(c.amount) > 0))
    ? "Each charge needs a description and an amount above zero."
    : null;
  // Never hide a problem inside the collapsed section.
  const showAdvanced = advancedOpen || !!chargesError;

  const selectResident = (r: ResidentPick) => {
    setResident(r);
    if (preview?.resident.id === r.id) return;
    setPreview(null);
    startPreview(async () => {
      try {
        const res = await checkOutPreviewAction(r.id);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setPreview(res.data);
        setCharges([]);
        setDeduction("0");
        setRefundOverride(null);
      } catch {
        toast.error("Could not load the stay. Check your connection and try again.");
      }
    });
  };

  const goTo = (i: number) => {
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => {
    if (!preview) return void toast.error(resident ? "Loading the stay…" : "Select a resident to continue.");
    goTo(SETTLE);
  };

  const submit = () => {
    if (!preview) return goTo(RESIDENT);
    const problem = dateError ?? chargesError ?? depositError;
    if (problem) return void toast.error(problem);
    const payload: CheckOutInput = {
      residentId: preview.resident.id,
      checkOutDate: date,
      finalCharges: charges.map((c) => ({ type: c.type, description: c.description.trim(), amount: parseMoney(c.amount) })),
      depositDeduction: deductionValue,
      depositRefund: refundValue,
      refundMethod: method,
      meterReading: meter.trim() || undefined,
      endReason: reason.trim() || undefined,
      notes: notes.trim() || undefined,
      clearanceFileId: clearance?.id,
    };
    const parsed = checkOutSchema.safeParse(payload);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Please check the details.");
    startTransition(async () => {
      try {
        const res = await checkOutAction(payload);
        if (!res.ok) return void toast.error(res.error);
        toast.success(res.message ?? "Resident checked out");
        router.push(`/residents/${res.data.residentId}`);
        router.refresh();
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
      }
    });
  };

  const canInvoice = preview?.canInvoice ?? false;
  const canRefund = preview?.canRefund ?? false;
  const s = preview ? suggest(preview, chargesTotal) : null;
  const kept = Math.max(0, deposit - (deductionValue || 0) - (refundValue || 0));

  return (
    <WizardShell
      steps={STEPS}
      current={step}
      maxReached={maxReached}
      onStepClick={goTo}
      title={preview?.resident.name ?? "Check out"}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={() => (step === RESIDENT ? router.back() : goTo(RESIDENT))} disabled={pending}>
            <ArrowLeft className="rtl:rotate-180" />
            {step === RESIDENT ? "Cancel" : "Back"}
          </Button>
          {step === SETTLE ? (
            <Button onClick={submit} disabled={pending || !preview} size="lg" className="flex-1 sm:flex-none">
              {pending ? <Spinner /> : <LogOut />}
              Check out
            </Button>
          ) : (
            <Button onClick={next} size="lg" className="flex-1 sm:flex-none" disabled={loadingPreview}>
              {loadingPreview ? <Spinner /> : null}
              Continue
              <ArrowRight className="rtl:rotate-180" />
            </Button>
          )}
        </>
      }
    >
      {step === RESIDENT ? <ResidentSearch mode="check-out" selected={resident} onSelect={selectResident} /> : null}

      {step === SETTLE && !preview ? <Skeleton className="h-40 rounded-xl" /> : null}

      {step === SETTLE && preview && s ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <ResidentAvatar name={preview.resident.name} photoFileId={preview.resident.photoFileId} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-medium">{preview.resident.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {preview.resident.residentCode} · {preview.assignment.hostel.name} · {preview.assignment.room.floor.name} · {preview.assignment.label} ·
                since {fmt.date(preview.assignment.checkInDate)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Outstanding" value={fmt.money(preview.balance.outstanding)} tone={preview.balance.outstanding > 0 ? "danger" : undefined} />
            <Metric label="Credit" value={fmt.money(preview.balance.credit)} tone={preview.balance.credit > 0 ? "success" : undefined} />
            <Metric label="Deposit held" value={fmt.money(deposit)} />
            <Metric label="Monthly rent" value={fmt.money(preview.assignment.monthlyRent)} />
          </div>

          {dues > 0 ? (
            <BalanceWarning
              amount={fmt.money(dues)}
              overdue={chargesTotal === 0 && preview.balance.overdue > 0 ? fmt.money(preview.balance.overdue) : null}
              afterCharges={chargesTotal > 0}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <DateInput
              id="checkout-date"
              label="Check-out date"
              value={date}
              onChange={setDate}
              max={today}
              min={toDateInput(preview.assignment.checkInDate)}
              error={dateError ?? undefined}
            />
            <MoneyInput id="checkout-deduction" label="Deduct from deposit" currency={fmt.currency} value={deduction} onChange={setDeduction} />
            <MoneyInput
              id="checkout-refund"
              label="Refund to resident"
              currency={fmt.currency}
              value={refund}
              onChange={setRefundOverride}
              error={depositError ?? undefined}
              description={kept > 0 ? `${fmt.money(kept)} kept by the hostel` : undefined}
            />
          </div>

          {deposit > 0 && s.deduction > 0 && (deductionValue !== s.deduction || refundValue !== s.refund) ? (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                setDeduction(String(s.deduction));
                setRefundOverride(String(s.refund));
              }}
            >
              <Wallet />
              Cover dues from deposit ({fmt.money(s.deduction)})
            </Button>
          ) : null}

          {canRefund && refundValue > 0 ? (
            <div className="grid max-w-xs gap-2">
              <Label htmlFor="checkout-method">Refund method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger id="checkout-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsFrom(paymentMethodLabels).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : refundValue > 0 ? (
            <p className="text-xs text-muted-foreground">The refund is recorded on the stay; a finance user records the payout.</p>
          ) : null}

          <Collapsible open={showAdvanced} onOpenChange={setAdvancedOpen} className="rounded-xl border">
            <CollapsibleTrigger className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-start text-sm font-medium hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <span>
                Advanced
                {!showAdvanced ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {charges.length ? `${charges.length} final charge${charges.length === 1 ? "" : "s"} · ` : ""}
                    {canInvoice ? "Final charges, " : ""}meter reading, clearance, reason, notes
                  </span>
                ) : null}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-5 border-t px-4 py-4">
              {canInvoice ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Final charges</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCharges((c) => [...c, { key: Date.now(), type: "ELECTRICITY", description: chargeTypeLabels.ELECTRICITY, amount: "" }])}
                      disabled={charges.length >= 20}
                    >
                      <Plus />
                      Add charge
                    </Button>
                  </div>
                  {charges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No final charges. Add electricity, damages or other dues if needed.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {charges.map((c, i) => (
                        <li key={c.key} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[160px_1fr_140px_auto] sm:items-center">
                          <Select
                            value={c.type}
                            onValueChange={(v) =>
                              setCharges((all) =>
                                all.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        type: v as ChargeType,
                                        description:
                                          x.description === chargeTypeLabels[x.type] || !x.description ? chargeTypeLabels[v as ChargeType] : x.description,
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="w-full" aria-label="Charge type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FINAL_CHARGE_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {chargeTypeLabels[t]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={c.description}
                            onChange={(e) => setCharges((all) => all.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                            placeholder="Description"
                            aria-label="Description"
                            maxLength={200}
                          />
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={c.amount}
                            onChange={(e) => setCharges((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                            placeholder={`Amount (${fmt.currency})`}
                            aria-label="Amount"
                            className="tabular"
                          />
                          <Button size="icon-sm" variant="ghost" onClick={() => setCharges((all) => all.filter((_, j) => j !== i))} aria-label="Remove charge">
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {chargesError ? <p className="text-sm text-destructive">{chargesError}</p> : null}
                  {charges.length > 0 ? (
                    <p className="text-sm">
                      Final invoice (before tax): <span className="tabular font-semibold">{fmt.money(chargesTotal)}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="checkout-meter">Final meter reading</Label>
                  <Input id="checkout-meter" value={meter} onChange={(e) => setMeter(e.target.value)} placeholder="e.g. 10452 kWh" maxLength={60} className="h-10" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="checkout-reason">Reason for leaving</Label>
                  <Input
                    id="checkout-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Completed studies, relocated, …"
                    maxLength={300}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Clearance form</Label>
                <FileUpload purpose="assignment-document" value={clearance} onChange={setClearance} label="Upload clearance" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="checkout-notes">Notes</Label>
                <Textarea id="checkout-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Room condition, keys returned, …" />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="rounded-xl bg-muted/40 p-4 text-sm">
            <p>
              Check out <span className="font-medium">{preview.resident.name}</span> from <span className="font-medium">{preview.assignment.label}</span> on{" "}
              <span className="font-medium">{date ? fmt.date(date) : "—"}</span>.
            </p>
            <p className="mt-1 text-muted-foreground">
              Refund <span className="tabular text-foreground">{fmt.money(refundValue || 0)}</span>
              {refundValue > 0 ? (canRefund ? ` (${paymentMethodLabels[method]})` : " (payout pending)") : ""} · deducted{" "}
              <span className="tabular text-foreground">{fmt.money(deductionValue || 0)}</span>
              {charges.length ? (
                <>
                  {" · "}final invoice <span className="tabular text-foreground">{fmt.money(chargesTotal)}</span> + tax
                </>
              ) : null}
              . The bed becomes available immediately.
            </p>
          </div>
        </div>
      ) : null}
    </WizardShell>
  );
}

/** Suggested split: cover dues from the deposit, refund the rest. */
function suggest(preview: CheckOutPreview, extraCharges: number) {
  const deposit = preview.assignment.securityDeposit;
  const dues = Math.max(0, preview.balance.balance + extraCharges);
  const deduction = Math.round(Math.min(deposit, dues) * 100) / 100;
  return { deduction, refund: Math.round((deposit - deduction) * 100) / 100 };
}

function Metric({ label, value, tone, className }: { label: string; value: string; tone?: "danger" | "success"; className?: string }) {
  return (
    <div className={cn("rounded-xl border p-3", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1 text-base font-semibold", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</p>
    </div>
  );
}

function BalanceWarning({ amount, overdue, afterCharges }: { amount: string; overdue: string | null; afterCharges?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">
          {afterCharges ? "Dues after final charges" : "Outstanding balance"}: <span className="tabular">{amount}</span>
          {overdue ? <span className="font-normal"> ({overdue} overdue)</span> : null}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-warning/90">
          <Wallet className="size-3.5" />
          You can still check out; the balance stays on the resident&apos;s account.
        </p>
      </div>
    </div>
  );
}
