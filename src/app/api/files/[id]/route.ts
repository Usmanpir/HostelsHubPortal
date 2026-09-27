import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/handler";
import { getSessionUser } from "@/lib/auth/session";
import { getTenantContext } from "@/lib/tenant/server";
import { getResidentContext } from "@/lib/tenant/resident";
import { NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { authorizeFileAccess } from "@/services/files/file-service";

/**
 * Serve a private file after authorization. Files are never publicly
 * addressable; S3 providers redirect to a 60-second signed URL.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) throw new UnauthenticatedError();
    const { id } = await context.params;
    const [ctx, resident] = await Promise.all([getTenantContext(), getResidentContext()]);
    const file = await authorizeFileAccess(
      { ctx, residentId: resident?.residentId ?? null, organizationId: resident?.organizationId ?? null, userId: user.id },
      id,
    );

    const storage = getStorage();
    const download = req.nextUrl.searchParams.get("download") === "1";
    if (storage.signedUrl) {
      const url = await storage.signedUrl(file.key, { expiresInSeconds: 60, downloadName: file.originalName });
      if (url) return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
    }
    const object = await storage.get(file.key);
    if (!object) throw new NotFoundError("File");
    return new Response(object.body as BodyInit, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(object.body.byteLength),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.originalName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
