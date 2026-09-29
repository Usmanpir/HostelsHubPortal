"use server";

import { runAction } from "@/lib/actions";
import type { PublicInquiryInput } from "@/lib/validation/public";
import { getRequestMeta } from "@/services/auth/request";
import { submitPublicInquiry } from "@/services/public/inquiry-service";

/** "Ask about this property" on the public listing page. Always answers the same way on success. */
export async function submitInquiryAction(input: PublicInquiryInput) {
  const meta = await getRequestMeta();
  return runAction(async () => {
    await submitPublicInquiry(input, meta);
    return null;
  });
}
