import "server-only";
import { normalizeError, type ErrorCode, type FieldErrors } from "@/lib/errors";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: ErrorCode; fieldErrors?: FieldErrors };

/**
 * Wrap a server action body: returns a serializable result and converts any
 * thrown error into a safe, user-facing message (internal errors are logged
 * server-side and never leak stack traces to the client).
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (error) {
    // Let Next.js control-flow errors (redirect/notFound) propagate.
    if (isNextControlFlow(error)) throw error;
    const appError = normalizeError(error);
    if (appError.code === "INTERNAL_ERROR") console.error("[action]", error);
    return { ok: false, error: appError.message, code: appError.code, fieldErrors: appError.fieldErrors };
  }
}

function isNextControlFlow(error: unknown) {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}
