import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/api/handler";
import { getTenantContext } from "@/lib/tenant/server";
import { getResidentContext } from "@/lib/tenant/resident";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { assertCanUpload, isUploadPurpose, storeUpload, UPLOAD_PURPOSES } from "@/services/files/file-service";

/** POST multipart/form-data { file, purpose } → { data: { id, originalName, size, mimeType } } */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await getTenantContext();
    const resident = ctx ? null : await getResidentContext();
    if (!ctx && !resident) throw new UnauthenticatedError();
    const userId = ctx?.userId ?? resident!.userId;
    await enforceRateLimit(`upload:${userId}`, RATE_LIMITS.upload);

    const form = await req.formData().catch(() => {
      throw new ValidationError("Expected a multipart form upload.");
    });
    const purpose = String(form.get("purpose") ?? "");
    const file = form.get("file");
    if (!isUploadPurpose(purpose)) throw new ValidationError("Unknown upload purpose.");
    if (!(file instanceof File)) throw new ValidationError("No file was provided.");

    if (ctx) assertCanUpload(ctx, purpose);
    // Residents may only attach photos to their own maintenance requests.
    else if (UPLOAD_PURPOSES[purpose].permission !== null) throw new ForbiddenError();

    const stored = await storeUpload(
      { organizationId: ctx?.organizationId ?? resident!.organizationId, userId },
      purpose,
      file,
    );
    return NextResponse.json({ data: { id: stored.id, name: stored.originalName, size: stored.size, mimeType: stored.mimeType } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
