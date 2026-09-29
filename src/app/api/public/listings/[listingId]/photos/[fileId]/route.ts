import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/handler";
import { authorizePublicListingPhoto } from "@/services/public/listings-service";
import { publicImageResponse } from "@/services/public/public-file-response";

/**
 * Public listing photo. Served only while the listing is published (ACTIVE or
 * UNDER_OFFER) on an enabled public page, and only for files attached to it.
 */
export async function GET(_req: NextRequest, context: { params: Promise<{ listingId: string; fileId: string }> }) {
  try {
    const { listingId, fileId } = await context.params;
    const file = await authorizePublicListingPhoto(listingId, fileId);
    return await publicImageResponse(file);
  } catch (error) {
    return errorResponse(error);
  }
}
