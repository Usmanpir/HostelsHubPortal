import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/api/handler";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { adminOrThrow, type AdminContext } from "@/services/admin/guard";

type Handler<P, R> = (args: { req: NextRequest; params: P; ctx: AdminContext }) => Promise<R>;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * JSON route handler for the super admin API: 401 without a session, 403
 * unless the session user is a super admin, CSRF origin check, rate limit on
 * writes and the standard `{ data }` / `{ error }` envelope.
 */
export function adminRoute<P = Record<string, never>, R = unknown>(handler: Handler<P, R>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      assertSameOrigin(req);
      const ctx = await adminOrThrow();
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

/** Query string as a plain object (validated by each service schema). */
export function query(req: NextRequest): Record<string, string> {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}
