"use client";

import { useState, type ReactNode } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/** Password input with a show/hide toggle and optional strength meter. */
export function PasswordField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  autoComplete = "current-password",
  showStrength,
  labelAction,
  autoFocus,
}: {
  control: Control<T, unknown, FieldValues> | Control<T>;
  name: FieldPath<T>;
  label: ReactNode;
  description?: ReactNode;
  autoComplete?: "current-password" | "new-password";
  showStrength?: boolean;
  /** Rendered at the end of the label row (e.g. "Forgot password?"). */
  labelAction?: ReactNode;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = `field-${name.replace(/\W/g, "-")}`;
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            {labelAction}
          </div>
          <InputGroup>
            <InputGroupInput
              id={id}
              type={visible ? "text" : "password"}
              autoComplete={autoComplete}
              autoFocus={autoFocus}
              aria-invalid={fieldState.invalid}
              {...field}
              value={(field.value as string | undefined) ?? ""}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {showStrength ? <StrengthMeter value={(field.value as string | undefined) ?? ""} /> : null}
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

function scorePassword(value: string) {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return Math.min(4, score);
}

const LEVELS = [
  { label: "Too weak", className: "bg-danger" },
  { label: "Weak", className: "bg-danger" },
  { label: "Fair", className: "bg-warning" },
  { label: "Good", className: "bg-success" },
  { label: "Strong", className: "bg-success" },
];

function StrengthMeter({ value }: { value: string }) {
  if (!value) {
    return <p className="text-xs text-muted-foreground">At least 8 characters with a letter and a number.</p>;
  }
  const score = scorePassword(value);
  const level = LEVELS[score]!;
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full bg-muted transition-colors", i <= score && level.className)} />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        <span className="sr-only">Password strength: </span>
        {level.label}
      </span>
    </div>
  );
}
