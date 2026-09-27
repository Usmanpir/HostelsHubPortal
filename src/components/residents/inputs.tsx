"use client";

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Uncontrolled-by-RHF inputs for the wizard steps (validated with the shared schema on submit). */

export function MoneyInput({
  id,
  label,
  value,
  onChange,
  currency,
  description,
  error,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  currency: string;
  description?: React.ReactNode;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="h-10">
        <InputGroupAddon>
          <InputGroupText>{currency}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          autoFocus={autoFocus}
          className="text-base tabular"
        />
      </InputGroup>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function DateInput({
  id,
  label,
  value,
  onChange,
  description,
  error,
  max,
  min,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  description?: React.ReactNode;
  error?: string;
  max?: string;
  min?: string;
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type="date" value={value} max={max} min={min} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className="h-10" />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Field orientation="horizontal" className={cn("rounded-lg border p-3", className)}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </FieldContent>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </Field>
  );
}

/** Parse a money input string; empty → 0, invalid → NaN. */
export function parseMoney(value: string) {
  if (value.trim() === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : Number.NaN;
}
