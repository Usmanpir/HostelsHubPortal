"use client";

import type { ReactNode } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type BaseProps<T extends FieldValues> = {
  control: Control<T, unknown, FieldValues> | Control<T>;
  name: FieldPath<T>;
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

function Label({ label, required, htmlFor }: { label?: ReactNode; required?: boolean; htmlFor: string }) {
  if (!label) return null;
  return (
    <FieldLabel htmlFor={htmlFor}>
      {label}
      {required ? <span className="text-destructive">*</span> : null}
    </FieldLabel>
  );
}

const fieldId = (name: string) => `field-${name.replace(/\W/g, "-")}`;

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
}: BaseProps<T> & {
  type?: "text" | "email" | "password" | "tel" | "number" | "date" | "time" | "datetime-local" | "url" | "color";
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label label={label} required={required} htmlFor={fieldId(name)} />
          <Input
            id={fieldId(name)}
            type={type}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
            {...field}
            value={(field.value as string | number | undefined) ?? ""}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  currency,
  placeholder = "0",
}: BaseProps<T> & { currency: string; placeholder?: string }) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label label={label} required={required} htmlFor={fieldId(name)} />
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>{currency}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id={fieldId(name)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder={placeholder}
              disabled={disabled}
              aria-invalid={fieldState.invalid}
              {...field}
              value={(field.value as string | number | undefined) ?? ""}
            />
          </InputGroup>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  rows = 3,
}: BaseProps<T> & { placeholder?: string; rows?: number }) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label label={label} required={required} htmlFor={fieldId(name)} />
          <Textarea
            id={fieldId(name)}
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
            {...field}
            value={(field.value as string | undefined) ?? ""}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export type Option = { value: string; label: string; description?: string };

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  options,
  placeholder = "Select…",
  allowEmpty,
  onValueChange,
}: BaseProps<T> & {
  options: Option[];
  placeholder?: string;
  /** Adds a "None" option that clears the value */
  allowEmpty?: string;
  onValueChange?: (value: string) => void;
}) {
  const EMPTY = "__none__";
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <Label label={label} required={required} htmlFor={fieldId(name)} />
          <Select
            value={(field.value as string | undefined) || (allowEmpty ? EMPTY : "")}
            onValueChange={(v) => {
              const value = v === EMPTY ? "" : v;
              field.onChange(value);
              onValueChange?.(value);
            }}
            disabled={disabled}
          >
            <SelectTrigger id={fieldId(name)} aria-invalid={fieldState.invalid} className="w-full" onBlur={field.onBlur}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowEmpty ? <SelectItem value={EMPTY}>{allowEmpty}</SelectItem> : null}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: BaseProps<T>) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field orientation="horizontal" data-invalid={fieldState.invalid} className={cn("rounded-lg border p-3", className)}>
          <FieldContent>
            <FieldLabel htmlFor={fieldId(name)}>{label}</FieldLabel>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
          </FieldContent>
          <Switch
            id={fieldId(name)}
            checked={!!field.value}
            onCheckedChange={field.onChange}
            disabled={disabled}
          />
        </Field>
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({ control, name, label, description, disabled, className }: BaseProps<T>) {
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className={className}>
          <Checkbox id={fieldId(name)} checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={disabled} />
          <FieldContent>
            <FieldLabel htmlFor={fieldId(name)} className="font-normal">
              {label}
            </FieldLabel>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
          </FieldContent>
        </Field>
      )}
    />
  );
}

/** Responsive two-column grid for form fields. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b pb-6 last:border-b-0 last:pb-0 md:grid-cols-[220px_1fr] md:gap-8">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
