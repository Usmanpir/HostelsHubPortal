"use client";

import { useTransition } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/lib/actions";

type Options<S extends z.ZodType<FieldValues, FieldValues>, R> = {
  schema: S;
  defaultValues: DefaultValues<z.input<S>>;
  action: (values: z.output<S>) => Promise<ActionResult<R>>;
  successMessage?: string | ((data: R) => string);
  onSuccess?: (data: R) => void;
};

/**
 * React Hook Form + Zod + server action glue:
 *  - validates on the client with the same schema the server uses
 *  - disables submit while pending
 *  - maps server field errors back onto inputs and toasts other errors
 */
export function useActionForm<S extends z.ZodType<FieldValues, FieldValues>, R = unknown>(options: Options<S, R>) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    // zodResolver's generics don't line up with a generic schema parameter; the
    // runtime contract (input → output of `schema`) is exactly what useForm expects.
    resolver: zodResolver(options.schema as never) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    defaultValues: options.defaultValues,
    mode: "onTouched",
  });

  const onSubmit = form.handleSubmit((values) =>
    new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          const result = await options.action(values);
          if (result.ok) {
            const msg =
              typeof options.successMessage === "function"
                ? options.successMessage(result.data)
                : (options.successMessage ?? result.message);
            if (msg) toast.success(msg);
            options.onSuccess?.(result.data);
          } else {
            applyServerErrors(form, result.fieldErrors);
            toast.error(result.error);
          }
        } catch {
          toast.error("Could not reach the server. Check your connection and try again.");
        } finally {
          resolve();
        }
      });
    }),
  );

  return { form, onSubmit, pending: pending || form.formState.isSubmitting };
}

export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T, unknown, FieldValues> | UseFormReturn<T, unknown, T>,
  fieldErrors?: Record<string, string[] | undefined>,
) {
  if (!fieldErrors) return;
  for (const [name, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) form.setError(name as Path<T>, { type: "server", message: messages[0] });
  }
}
