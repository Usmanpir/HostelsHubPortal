import "server-only";
import type { NextRequest } from "next/server";
import type { CallbackPayload } from "@/services/payments/types";

const MAX_FIELDS = 80;
const MAX_VALUE = 4096;

/**
 * Gateway callbacks arrive as query strings (GET redirects), form posts or
 * JSON. Flatten them into string fields; body values win over the query.
 */
export async function readCallbackPayload(req: NextRequest): Promise<CallbackPayload> {
  const out: CallbackPayload = {};
  const put = (key: string, value: unknown) => {
    if (Object.keys(out).length >= MAX_FIELDS || key.length > 64) return;
    if (typeof value === "string") out[key] = value.slice(0, MAX_VALUE);
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
  };
  for (const [key, value] of req.nextUrl.searchParams.entries()) put(key, value);
  if (req.method === "GET" || req.method === "HEAD") return out;

  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const json: unknown = await req.json();
      if (json && typeof json === "object" && !Array.isArray(json)) {
        for (const [key, value] of Object.entries(json as Record<string, unknown>)) put(key, value);
      }
    } else if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const [key, value] of form.entries()) put(key, typeof value === "string" ? value : "");
    }
  } catch {
    // Malformed body: fall through with whatever the query carried; verification will reject it.
  }
  return out;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Minimal self-submitting page used to hand the browser to the gateway's next step. */
export function autoSubmitPage(form: { actionUrl: string; method: "POST" | "GET"; fields: Record<string, string> }) {
  const inputs = Object.entries(form.fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Continuing to payment…</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#334155}button{font:inherit;padding:.6rem 1rem;border-radius:.5rem;border:1px solid #cbd5e1;background:#fff;cursor:pointer}</style></head>
<body><form id="f" method="${form.method}" action="${escapeHtml(form.actionUrl)}">${inputs}<p>Continuing to your payment…</p><button type="submit">Continue</button></form>
<script>document.getElementById("f").submit();</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
