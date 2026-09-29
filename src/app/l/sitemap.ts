import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/components/public/format";
import { listPublicSitemapEntries } from "@/services/public/listings-service";

// Rendered per request so builds never need a database connection.
export const dynamic = "force-dynamic";

/** /l/sitemap.xml — every enabled public page and its published listings. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await listPublicSitemapEntries();
  return entries.map((e) => ({
    url: absoluteUrl(e.path),
    lastModified: e.lastModified,
    changeFrequency: "daily",
  }));
}
