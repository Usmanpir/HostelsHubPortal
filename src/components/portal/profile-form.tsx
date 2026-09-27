"use client";

import { useRouter } from "next/navigation";
import { FormGrid, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { portalProfileSchema } from "@/lib/validation/portal";
import { updatePortalProfileAction } from "@/app/portal/actions";

export type ProfileFormValues = {
  phone: string;
  alternatePhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
};

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: portalProfileSchema,
    defaultValues: {
      phone: initial.phone,
      alternatePhone: initial.alternatePhone ?? "",
      emergencyContactName: initial.emergencyContactName ?? "",
      emergencyContactPhone: initial.emergencyContactPhone ?? "",
      emergencyContactRelation: initial.emergencyContactRelation ?? "",
    },
    action: updatePortalProfileAction,
    successMessage: (data) => (data.changed ? "Profile updated" : "No changes to save"),
    onSuccess: () => router.refresh(),
  });
  const c = form.control;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4">
        <h3 className="text-sm font-semibold">Contact numbers</h3>
        <FormGrid>
          <TextField control={c} name="phone" label="Phone" type="tel" required autoComplete="tel" inputMode="tel" />
          <TextField control={c} name="alternatePhone" label="Alternate phone" type="tel" inputMode="tel" />
        </FormGrid>
      </div>
      <div className="grid gap-4">
        <h3 className="text-sm font-semibold">Emergency contact</h3>
        <FormGrid>
          <TextField control={c} name="emergencyContactName" label="Name" autoComplete="off" />
          <TextField control={c} name="emergencyContactRelation" label="Relation" placeholder="e.g. Father" />
          <TextField control={c} name="emergencyContactPhone" label="Phone" type="tel" inputMode="tel" />
        </FormGrid>
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} className="w-full sm:w-auto">
          Save changes
        </SubmitButton>
      </div>
    </form>
  );
}
