"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError } from "@/components/ui/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormDialog } from "@/components/shared/form-dialog";
import { expenseCategorySchema } from "@/lib/validation/finance";
import { createExpenseCategoryAction, deleteExpenseCategoryAction } from "@/app/(app)/finance/actions";

export type CategoryRow = { id: string; name: string; isSystem: boolean; expenseCount: number };

export function ExpenseCategoriesDialog({
  trigger,
  categories,
  canManage,
}: {
  trigger: React.ReactNode;
  categories: CategoryRow[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, pending } = useActionForm({
    schema: expenseCategorySchema,
    defaultValues: { name: "" },
    action: createExpenseCategoryAction,
    onSuccess: () => {
      form.reset();
      router.refresh();
    },
  });
  const nameError = form.formState.errors.name;

  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Expense categories"
      description="Built-in categories can't be removed. Custom categories can be deleted while no expenses use them."
    >
      <div className="flex flex-col gap-4">
        {canManage ? (
          <form onSubmit={onSubmit} className="flex items-start gap-2" noValidate>
            <Field data-invalid={!!nameError} className="flex-1">
              <Input {...form.register("name")} placeholder="New category, e.g. Pest control" aria-label="Category name" aria-invalid={!!nameError} />
              <FieldError errors={[nameError]} />
            </Field>
            <SubmitButton pending={pending} pendingText="Adding…">
              <Plus />
              Add
            </SubmitButton>
          </form>
        ) : null}
        <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-lg border">
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{cat.name}</span>
              <span className="text-xs text-muted-foreground tabular">
                {cat.expenseCount} expense{cat.expenseCount === 1 ? "" : "s"}
              </span>
              {cat.isSystem ? (
                <span className="flex size-7 items-center justify-center text-muted-foreground" title="Built-in category">
                  <Lock className="size-3.5" />
                  <span className="sr-only">Built-in</span>
                </span>
              ) : canManage ? (
                <ConfirmAction
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${cat.name}`}
                      disabled={cat.expenseCount > 0}
                      title={cat.expenseCount > 0 ? "In use — can't be deleted" : "Delete category"}
                    >
                      <Trash2 />
                    </Button>
                  }
                  title={`Delete "${cat.name}"?`}
                  description="This custom category isn't used by any expense."
                  confirmLabel="Delete"
                  destructive
                  action={deleteExpenseCategoryAction.bind(null, cat.id)}
                />
              ) : (
                <span className="size-7" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </FormDialog>
  );
}
