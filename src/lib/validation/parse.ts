import { z } from "zod";
import { ValidationError } from "@/lib/errors";

/** Validate untrusted input; throws a ValidationError with per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const flat = z.flattenError(result.error);
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries(flat.fieldErrors as Record<string, string[] | undefined>)) {
      if (messages?.length) fieldErrors[key] = messages;
    }
    const first = flat.formErrors[0] ?? Object.values(fieldErrors)[0]?.[0];
    throw new ValidationError(first ?? "Please check the highlighted fields.", fieldErrors);
  }
  return result.data;
}
