import type { NextRequest } from "next/server";

/** Void/cancel reason from `?reason=` or a JSON body `{ "reason": "..." }`. */
export async function readReason(req: NextRequest): Promise<string> {
  const fromQuery = req.nextUrl.searchParams.get("reason");
  if (fromQuery) return fromQuery;
  const text = await req.text().catch(() => "");
  if (!text.trim()) return "";
  try {
    const body = JSON.parse(text) as { reason?: unknown } | null;
    return body && typeof body.reason === "string" ? body.reason : "";
  } catch {
    return "";
  }
}
