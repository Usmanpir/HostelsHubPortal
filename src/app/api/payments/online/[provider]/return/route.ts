import { NextResponse, type NextRequest } from "next/server";
import { clientIpFromHeaders } from "@/lib/security/request";
import { appBaseUrl, providerFromSlug } from "@/services/payments/registry";
import { CHECKOUT_COOKIE, handleGatewayReturn } from "@/services/payments/online-payment-service";
import { autoSubmitPage, readCallbackPayload } from "../../_lib/payload";

/**
 * Browser return from the gateway (JazzCash POSTs a form; Easypaisa redirects
 * with query params, first with auth_token and finally with the result).
 *
 * No session or CSRF check: this endpoint is called cross-site by design.
 * Authenticity comes only from the gateway signature or a server-side status
 * inquiry inside completeOnlinePayment — the browser payload alone never
 * changes anything.
 */
export const dynamic = "force-dynamic";

async function handle(req: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await context.params;
  const provider = providerFromSlug(slug);
  if (!provider) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown payment provider." } }, { status: 404 });

  const payload = await readCallbackPayload(req);
  const outcome = await handleGatewayReturn(provider, payload, {
    checkoutRef: req.cookies.get(CHECKOUT_COOKIE)?.value ?? null,
    referer: req.headers.get("referer"),
    ip: clientIpFromHeaders(req.headers),
  });
  if (outcome.kind === "form") return autoSubmitPage(outcome.form);

  // 303 so a POST from the gateway becomes a GET of the invoice page.
  const res = NextResponse.redirect(new URL(outcome.path, appBaseUrl()), 303);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const GET = handle;
export const POST = handle;
