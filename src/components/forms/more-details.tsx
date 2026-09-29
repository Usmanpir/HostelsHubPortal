"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { get, type FieldErrors, type FieldValues } from "react-hook-form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Optional fields tucked behind a "More details" toggle so forms show only the
 * essentials. Pass the form's `errors` and the field names inside: the section
 * opens itself whenever one of them fails validation, so errors are never hidden.
 * Closed content is unmounted; React Hook Form keeps the values (no data loss).
 */
export function MoreDetails<T extends FieldValues>({
  errors,
  fields,
  label = "More details",
  hint,
  defaultOpen = false,
  children,
  className,
}: {
  errors?: FieldErrors<T>;
  fields?: readonly string[];
  label?: string;
  /** Short list of what's inside, e.g. "Email, CNIC, emergency contact". */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasError = !!errors && (fields ?? []).some((name) => !!get(errors, name));
  const isOpen = open || hasError;

  return (
    <Collapsible open={isOpen} onOpenChange={setOpen} className={cn("rounded-xl border", className)}>
      <CollapsibleTrigger
        type="button"
        className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {label}
            {hasError ? <span className="ms-2 text-xs font-normal text-destructive">Needs attention</span> : null}
          </span>
          {hint && !isOpen ? <span className="block truncate text-xs text-muted-foreground">{hint}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-5 border-t px-4 py-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Small heading used to group fields inside a MoreDetails section. */
export function SubHeading({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h4>;
}
