"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SwitchField, TextareaField, TextField } from "@/components/forms/fields";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { FormDialog } from "@/components/shared/form-dialog";
import { duplicateRoleSchema, roleSchema } from "@/lib/validation/settings";
import { createRoleAction, duplicateRoleAction } from "@/app/(app)/settings/actions";

type Props =
  | { mode: "create"; trigger?: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }
  | {
      mode: "duplicate";
      source: { id: string; name: string };
      trigger?: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    };

/** Create a custom role (then edit its permissions) or duplicate an existing role. */
export function RoleDialog(props: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open ?? internalOpen;
  const setOpen = props.onOpenChange ?? setInternalOpen;

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={props.trigger}
      title={props.mode === "create" ? "New role" : `Duplicate ${props.source.name}`}
      description={
        props.mode === "create"
          ? "Name the role, then choose its permissions on the next screen."
          : "Creates a custom role with the same permissions that you can then adjust."
      }
    >
      {open ? (
        props.mode === "create" ? (
          <CreateRoleForm onDone={() => setOpen(false)} />
        ) : (
          <DuplicateRoleForm source={props.source} onDone={() => setOpen(false)} />
        )
      ) : null}
    </FormDialog>
  );
}

function CreateRoleForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: roleSchema,
    defaultValues: { name: "", description: "", defaultAllHostels: false, permissions: ["dashboard.view"] },
    action: (values) => createRoleAction(values),
    onSuccess: (data) => {
      onDone();
      router.push(`/settings/roles/${data.id}`);
    },
  });
  const c = form.control;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField control={c} name="name" label="Role name" required placeholder="Night supervisor" />
      <TextareaField control={c} name="description" label="Description" rows={2} placeholder="What this role is responsible for" />
      <SwitchField
        control={c}
        name="defaultAllHostels"
        label="Access all hostels by default"
        description="Pre-selects “all hostels” when inviting someone with this role."
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>Create & set permissions</SubmitButton>
      </div>
    </form>
  );
}

function DuplicateRoleForm({ source, onDone }: { source: { id: string; name: string }; onDone: () => void }) {
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: duplicateRoleSchema,
    defaultValues: { name: `${source.name} (copy)`.slice(0, 60) },
    action: (values) => duplicateRoleAction(source.id, values),
    onSuccess: (data) => {
      onDone();
      router.push(`/settings/roles/${data.id}`);
    },
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField control={form.control} name="name" label="New role name" required />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>Duplicate role</SubmitButton>
      </div>
    </form>
  );
}
