"use client";

import { useState, type KeyboardEvent } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Tag-style input for short phrases (features, amenities). Enter or comma adds a chip. */
export function ChipsField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder = "Type and press Enter",
  suggestions = [],
  max = 40,
}: {
  control: Control<T, unknown, FieldValues> | Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  placeholder?: string;
  suggestions?: string[];
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  return (
    <Controller
      control={control as Control<T>}
      name={name}
      render={({ field, fieldState }) => {
        const chips = toList(field.value);
        const has = (v: string) => chips.some((c) => c.toLowerCase() === v.toLowerCase());
        const add = (raw: string) => {
          const parts = raw.split(",").map((s) => s.trim().slice(0, 60)).filter(Boolean);
          const next = [...chips];
          for (const p of parts) if (!next.some((c) => c.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
          field.onChange(next);
          setDraft("");
        };
        const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (draft.trim()) add(draft);
          } else if (e.key === "Backspace" && !draft && chips.length) {
            field.onChange(chips.slice(0, -1));
          }
        };
        const open = suggestions.filter((s) => !has(s)).slice(0, 10);
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`chips-${name}`}>{label}</FieldLabel>
            {chips.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={`${label} added`}>
                {chips.map((c) => (
                  <li key={c} className="inline-flex items-center gap-1 rounded-full border bg-accent/40 py-0.5 ps-2.5 pe-1 text-xs">
                    {c}
                    <button
                      type="button"
                      className="flex size-5 items-center justify-center rounded-full hover:bg-background"
                      onClick={() => field.onChange(chips.filter((x) => x !== c))}
                      aria-label={`Remove ${c}`}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <Input
                id={`chips-${name}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => {
                  if (draft.trim()) add(draft);
                  field.onBlur();
                }}
                placeholder={placeholder}
                disabled={chips.length >= max}
              />
              <Button type="button" variant="outline" size="icon" onClick={() => draft.trim() && add(draft)} aria-label={`Add ${label.toLowerCase()}`}>
                <Plus />
              </Button>
            </div>
            {open.length ? (
              <div className="flex flex-wrap gap-1.5">
                {open.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => add(s)}
                    className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            ) : null}
            {description ? <FieldDescription>{description}</FieldDescription> : null}
            <FieldError errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}
