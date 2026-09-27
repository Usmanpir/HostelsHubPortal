"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { ChevronDown, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormGrid, SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { visitorCheckInSchema } from "@/lib/validation/operations";
import { checkInVisitorAction } from "@/app/(app)/operations/actions";
import { ResidentField, type ResidentOption } from "./pickers";
import type { HostelChoice } from "./maintenance-form";

/** Reception quick check-in. Big targets, minimal required fields, stays on screen after submit. */
export function VisitorCheckInForm({ hostels, defaultHostelId }: { hostels: HostelChoice[]; defaultHostelId?: string | null }) {
  const router = useRouter();
  const [resident, setResident] = useState<ResidentOption | null>(null);
  const [more, setMore] = useState(false);
  const initialHostel = defaultHostelId ?? (hostels.length === 1 ? hostels[0]!.id : "");
  const blank = (hostelId: string) => ({ hostelId, name: "", phone: "", idNumber: "", residentId: "", purpose: "", notes: "" });

  const { form, onSubmit, pending } = useActionForm({
    schema: visitorCheckInSchema,
    defaultValues: blank(initialHostel),
    action: checkInVisitorAction,
    onSuccess: (data) => {
      toast.success(`${(data as { name: string }).name} checked in`);
      form.reset(blank(form.getValues("hostelId")));
      setResident(null);
      setMore(false);
      router.refresh();
    },
  });
  const c = form.control;
  const hostelId = useWatch({ control: c, name: "hostelId" });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {hostels.length > 1 ? (
        <SelectField
          control={c}
          name="hostelId"
          label="Hostel"
          required
          options={hostels.map((h) => ({ value: h.id, label: h.name }))}
          onValueChange={() => {
            form.setValue("residentId", "");
            setResident(null);
          }}
        />
      ) : null}
      <TextField control={c} name="name" label="Visitor name" required autoComplete="off" placeholder="Full name" />
      <FormGrid>
        <TextField control={c} name="phone" label="Phone" type="tel" inputMode="tel" autoComplete="off" placeholder="03xx xxxxxxx" />
        <TextField control={c} name="idNumber" label="CNIC / ID" autoComplete="off" placeholder="xxxxx-xxxxxxx-x" />
      </FormGrid>
      <ResidentField control={c} name="residentId" label="Visiting" activeOnly hostelId={hostelId} selected={resident} onSelectedChange={setResident} />
      <TextField control={c} name="purpose" label="Purpose" placeholder="Family visit, delivery, interview…" />
      <Collapsible open={more} onOpenChange={setMore}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="-ms-2 text-muted-foreground">
            <ChevronDown className={more ? "rotate-180 transition-transform" : "transition-transform"} />
            {more ? "Hide notes" : "Add notes"}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <TextareaField control={c} name="notes" label="Notes" rows={2} placeholder="Vehicle number, items carried…" />
        </CollapsibleContent>
      </Collapsible>
      <SubmitButton pending={pending} pendingText="Checking in…" className="h-11 w-full text-base">
        <LogIn />
        Check in visitor
      </SubmitButton>
    </form>
  );
}
