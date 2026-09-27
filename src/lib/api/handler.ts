import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ForbiddenError, normalizeError, ValidationError } from "@/lib/errors";
import { tenantOrThrow } from "@/lib/tenant/server";
import type { TenantContext } from "@/lib/tenant/context";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

type Handler<P, R> = (args: { req: NextRequest; params: P; ctx: TenantContext }) => Promise<R>;

/**
 * Standard JSON route handler for tenant-scoped APIs:
 *  - resolves the TenantContext from the session (401 if absent)
 *  - rejects cross-site state-changing requests (CSRF)
 *  - applies a per-user rate limit
 *  - maps AppErrors to status codes: { error: { code, message, fieldErrors } }
 */
export function tenantRoute<P = Record<string, never>, R = unknown>(handler: Handler<P, R>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      assertSameOrigin(req);
      const ctx = await tenantOrThrow();
      if (!SAFE_METHODS.has(req.method)) await enforceRateLimit(`api:${ctx.userId}`, RATE_LIMITS.api);
      const params = await context.params;
      const data = await handler({ req, params, ctx });
      if (data instanceof Response) return data;
      return NextResponse.json({ data: data ?? null }, { status: req.method === "POST" ? 201 : 200 });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function errorResponse(error: unknown) {
  const appError = normalizeError(error);
  if (appError.code === "INTERNAL_ERROR") console.error("[api]", error);
  const headers: HeadersInit = appError.code === "RATE_LIMITED" ? { "Retry-After": "60" } : {};
  return NextResponse.json(
    { error: { code: appError.code, message: appError.message, fieldErrors: appError.fieldErrors } },
    { status: appError.status, headers },
  );
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Double-check Origin on mutating requests (session cookies are SameSite=Lax too). */
export function assertSameOrigin(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (no ambient cookies from other sites)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new ForbiddenError("Cross-site request blocked.");
  } catch (e) {
    if (e instanceof ForbiddenError) throw e;
    throw new ForbiddenError("Cross-site request blocked.");
  }
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

export function searchParamsObject(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}
