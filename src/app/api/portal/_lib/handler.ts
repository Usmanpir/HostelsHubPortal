import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/api/handler";
import { residentOrThrow, type ResidentContext } from "@/lib/tenant/resident";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

type Handler<P, R> = (args: { req: NextRequest; params: P; ctx: ResidentContext }) => Promise<R>;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * JSON route handler for the resident portal API. Same contract as
 * `tenantRoute`: CSRF origin check, per-user rate limit on writes, and the
 * standard `{ data }` / `{ error: { code, message, fieldErrors } }` envelope.
 * The ResidentContext comes from the session — never from the request.
 */
export function residentRoute<P = Record<string, never>, R = unknown>(handler: Handler<P, R>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      assertSameOrigin(req);
      const ctx = await residentOrThrow();
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

export function pageParams(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return { page: p.get("page") ?? undefined, pageSize: p.get("pageSize") ?? undefined };
}
