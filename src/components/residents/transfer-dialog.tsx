"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Controller, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/ui/field";
import { FormGrid, MoneyField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { useFormatters, useTerms } from "@/components/shared/org-context";
import { transferSchema } from "@/lib/validation/resident";
import { transferAction } from "@/app/(app)/residents/actions";
import { BedChoices, findBed, MapState, useHostelBedMap, type AssignableHostel } from "./bed-picker";

/** Move a resident to another bed, room or hostel. Opens automatically with `?transfer=1`. */
export function TransferDialog({
  trigger,
  resident,
  hostels,
  today,
  defaultOpen,
}: {
  trigger: React.ReactNode;
  resident: { id: string; name: string; hostelId: string; label: string; monthlyRent: number; bedId: string };
  hostels: AssignableHostel[];
  today: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fmt = useFormatters();
  const terms = useTerms();
  const [open, setOpen] = useState(!!defaultOpen);
  const [hostelId, setHostelId] = useState<string | null>(hostels.some((h) => h.id === resident.hostelId) ? resident.hostelId : (hostels[0]?.id ?? null));
  const [roomId, setRoomId] = useState<string | null>(null);
  const { map, loading, failed, reload } = useHostelBedMap(open ? hostelId : null);

  /** Drop `?transfer=1` when the dialog closes so a refresh doesn't reopen it. */
  const close = (next: boolean) => {
    setOpen(next);
    if (!next && searchParams.get("transfer")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("transfer");
      router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
    }
  };

  const { form, onSubmit, pending } = useActionForm({
    schema: transferSchema,
    defaultValues: { residentId: resident.id, toBedId: "", transferDate: today, monthlyRent: resident.monthlyRent, notes: "" },
    action: transferAction,
    onSuccess: () => {
      close(false);
      form.reset();
      setRoomId(null);
      router.refresh();
    },
  });

  const rooms = (map?.floors ?? []).flatMap((f) => f.rooms.map((r) => ({ ...r, floorName: f.name })));
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const bedId = useWatch({ control: form.control, name: "toBedId" });
  const picked = bedId ? findBed(map, bedId) : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      trigger={trigger}
      title={`Transfer ${resident.name}`}
      description={`Currently in ${resident.label}. The current ${terms.stay.toLowerCase()} ends on the transfer date and a new one starts, keeping the deposit.`}
      className="sm:max-w-xl"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormGrid>
          <div className="grid gap-2">
            <Label htmlFor="transfer-hostel">{terms.property}</Label>
            <Select
              value={hostelId ?? ""}
              onValueChange={(v) => {
                setHostelId(v);
                setRoomId(null);
                form.setValue("toBedId", "", { shouldValidate: false });
              }}
            >
              <SelectTrigger id="transfer-hostel" className="w-full">
                <SelectValue placeholder="Select hostel" />
              </SelectTrigger>
              <SelectContent>
                {hostels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name} · {h.availableBeds} free
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="transfer-room">{terms.unit}</Label>
            <Select
              value={roomId ?? ""}
              onValueChange={(v) => {
                setRoomId(v);
                form.setValue("toBedId", "", { shouldValidate: false });
              }}
              disabled={!map || loading}
            >
              <SelectTrigger id="transfer-room" className="w-full">
                <SelectValue placeholder={loading ? "Loading rooms…" : "Select room"} />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id} disabled={r.availableBeds === 0}>
                    {r.floorName} · Room {r.roomNumber} ({r.availableBeds} free)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FormGrid>

        {hostelId && (!map || loading) ? <MapState failed={failed} onRetry={reload} /> : null}

        {room ? (
          <Controller
            control={form.control}
            name="toBedId"
            render={({ fieldState }) => (
              <div className="grid gap-2">
                <Label>Bed</Label>
                <BedChoices
                  room={room}
                  value={bedId || null}
                  onChange={(b) => {
                    if (b.id === resident.bedId) return;
                    form.setValue("toBedId", b.id, { shouldValidate: true });
                    form.setValue("monthlyRent", b.rent);
                  }}
                />
                <FieldError errors={[fieldState.error]} />
              </div>
            )}
          />
        ) : null}

        <FormGrid>
          <TextField control={form.control} name="transferDate" label="Transfer date" type="date" required />
          <MoneyField
            control={form.control}
            name="monthlyRent"
            label="New monthly rent"
            currency={fmt.currency}
            required
            description={`Current: ${fmt.money(resident.monthlyRent)}`}
          />
        </FormGrid>
        <TextareaField control={form.control} name="notes" label="Notes" rows={2} placeholder="Reason for the move" />

        {picked ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{resident.label}</span>
            <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" />
            <span className="font-medium">
              {map?.hostel.id !== resident.hostelId ? `${map?.hostel.name} · ` : ""}Room {picked.room.roomNumber} · Bed {picked.bed.bedNumber}
            </span>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending} pendingText="Transferring…">
            Transfer
          </SubmitButton>
        </div>
      </form>
    </FormDialog>
  );
}
