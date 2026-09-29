import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/handler";
import { authorizePublicOrgLogo } from "@/services/public/listings-service";
import { publicImageResponse } from "@/services/public/public-file-response";

/** Organization logo for its public listings page (only while the page is enabled). */
export async function GET(_req: NextRequest, context: { params: Promise<{ orgSlug: string }> }) {
  try {
    const { orgSlug } = await context.params;
    const file = await authorizePublicOrgLogo(orgSlug);
    return await publicImageResponse(file);
  } catch (error) {
    return errorResponse(error);
  }
}
