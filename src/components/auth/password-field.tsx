"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Check, Circle, Eye, EyeOff, TriangleAlert } from "lucide-react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

/**
 * Password input with a show/hide toggle, a Caps Lock hint, and optionally a
 * strength meter with live requirements or a "passwords match" indicator.
 */
export function PasswordField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  autoComplete = "current-password",
  showStrength,
  labelAction,
  autoFocus,
  matchValue,
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
  /** For confirm fields: the password this one must match. */
  matchValue?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const detectCapsLock = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);
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
              onKeyDown={detectCapsLock}
              onKeyUp={detectCapsLock}
              onBlur={() => {
                setCapsLock(false);
                field.onBlur();
              }}
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
          {capsLock ? (
            <p className="flex items-center gap-1.5 text-xs text-warning" role="status">
              <TriangleAlert className="size-3.5" />
              Caps Lock is on
            </p>
          ) : null}
          {showStrength ? <StrengthMeter value={(field.value as string | undefined) ?? ""} /> : null}
          {matchValue !== undefined && !fieldState.invalid ? (
            <MatchHint value={(field.value as string | undefined) ?? ""} target={matchValue} />
          ) : null}
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

/** Mirrors `passwordSchema` in src/lib/validation/common.ts. */
const REQUIREMENTS = [
  { label: "8+ characters", test: (v: string) => v.length >= 8 },
  { label: "A letter", test: (v: string) => /[a-zA-Z]/.test(v) },
  { label: "A number", test: (v: string) => /\d/.test(v) },
];

function StrengthMeter({ value }: { value: string }) {
  const score = value ? scorePassword(value) : 0;
  const level = LEVELS[score]!;
  return (
    <div className="flex flex-col gap-2">
      {value ? (
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
      ) : null}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
        {REQUIREMENTS.map(({ label, test }) => {
          const met = test(value);
          return (
            <li key={label} className={cn("flex items-center gap-1.5 transition-colors", met ? "text-success" : "text-muted-foreground")}>
              {met ? <Check className="size-3.5" /> : <Circle className="size-3" />}
              {label}
              <span className="sr-only">{met ? "(met)" : "(not met)"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MatchHint({ value, target }: { value: string; target: string }) {
  if (!value || !target) return null;
  const matches = value === target;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", matches ? "text-success" : "text-muted-foreground")} aria-live="polite">
      {matches ? <Check className="size-3.5" /> : <Circle className="size-3" />}
      {matches ? "Passwords match" : "Passwords don't match yet"}
    </p>
  );
}
