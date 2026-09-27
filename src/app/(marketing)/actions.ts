"use server";

import { runAction } from "@/lib/actions";
import { enforceRateLimit, type RateLimitRule } from "@/lib/security/rate-limit";
import type { DemoRequestInput } from "@/lib/validation/auth";
import { sendDemoRequest } from "@/services/auth/contact-service";
import { getRequestMeta } from "@/services/auth/request";

const DEMO_REQUEST_LIMIT: RateLimitRule = { limit: 5, windowSeconds: 60 * 60 };

/** "Book a demo" form on the landing page. */
export async function requestDemoAction(input: DemoRequestInput) {
  const meta = await getRequestMeta();
  return runAction(async () => {
    await enforceRateLimit(`demo-request:${meta.ipAddress}`, DEMO_REQUEST_LIMIT);
    await sendDemoRequest(input, meta);
    return null;
  }, "Thanks! We'll be in touch shortly.");
}
