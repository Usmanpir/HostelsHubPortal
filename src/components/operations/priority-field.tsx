"use client";

import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { priorityLabels } from "@/config/labels";
import { PRIORITIES } from "@/lib/validation/operations";
import { cn } from "@/lib/utils";

const activeTone: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "data-[state=on]:bg-muted data-[state=on]:text-foreground",
  MEDIUM: "data-[state=on]:bg-info-soft data-[state=on]:text-info",
  HIGH: "data-[state=on]:bg-warning-soft data-[state=on]:text-warning",
  URGENT: "data-[state=on]:bg-danger-soft data-[state=on]:text-danger",
};

/** Segmented priority picker — one tap on mobile. */
export function PriorityField<T extends FieldValues>({
  control,
  name,
  label = "Priority",
}: {
  control: Control<T, unknown, FieldValues> | Control<T>;
  name: FieldPath<T>;
  label?: string;
}) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel>{label}</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={(field.value as string | undefined) ?? "MEDIUM"}
            onValueChange={(v) => v && field.onChange(v)}
            className="grid w-full grid-cols-4"
            aria-label={label}
          >
            {PRIORITIES.map((p) => (
              <ToggleGroupItem key={p} value={p} className={cn("h-9 w-full text-xs sm:text-sm", activeTone[p])}>
                {priorityLabels[p]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}
