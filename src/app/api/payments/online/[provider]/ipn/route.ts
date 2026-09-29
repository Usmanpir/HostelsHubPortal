import { NextResponse, type NextRequest } from "next/server";
import { providerFromSlug } from "@/services/payments/registry";
import { handleGatewayIpn } from "@/services/payments/online-payment-service";
import { GatewayVerificationError } from "@/services/payments/types";
import { readCallbackPayload } from "../../_lib/payload";

/**
 * Server-to-server payment notifications (Easypaisa IPN; JazzCash IPN where
 * provisioned). Called by the gateway, so there is no session/CSRF check.
 * Nothing in the notification is trusted: the payment outcome is established
 * by signature verification or a status inquiry before anything changes.
 *
 * Responses: 200 when handled (including "already processed"), 400 for
 * notifications we can't attribute, 500 on transient errors so the gateway
 * retries.
 */
export const dynamic = "force-dynamic";

async function handle(req: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await context.params;
  const provider = providerFromSlug(slug);
  if (!provider || provider === "SIMULATOR") {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown payment provider." } }, { status: 404 });
  }
  try {
    const result = await handleGatewayIpn(provider, await readCallbackPayload(req));
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof GatewayVerificationError) {
      return NextResponse.json({ ok: false, error: "Notification could not be verified." }, { status: 400 });
    }
    console.error(`[payments] ${provider} IPN failed`, error);
    return NextResponse.json({ ok: false, error: "Temporary error." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
