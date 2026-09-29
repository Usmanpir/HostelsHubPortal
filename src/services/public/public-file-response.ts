import "server-only";
import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import type { PublicFile } from "./listings-service";

const SIGNED_URL_SECONDS = 2 * 60 * 60;

/**
 * Serve an already-authorized public image. Providers with signed URLs get a
 * redirect (the redirect is cached for less time than the URL stays valid);
 * otherwise the bytes are streamed with a long public cache.
 */
export async function publicImageResponse(file: PublicFile): Promise<Response> {
  const storage = getStorage();
  if (storage.signedUrl) {
    const url = await storage.signedUrl(file.key, { expiresInSeconds: SIGNED_URL_SECONDS });
    if (url) {
      return NextResponse.redirect(url, {
        status: 302,
        headers: { "Cache-Control": "public, max-age=1800", "X-Content-Type-Options": "nosniff" },
      });
    }
  }
  const object = await storage.get(file.key);
  if (!object) throw new NotFoundError("File");
  // Only raster/vector images reach here (authorization filters on image/*); SVG is sandboxed by the CSP.
  return new Response(object.body as BodyInit, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(object.body.byteLength),
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
