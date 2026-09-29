import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/errors";
import { getPublicListing, getPublicOrg } from "@/services/public/listings-service";

/** Per-request memoized loaders shared by layouts, pages and generateMetadata. Missing → 404. */

async function or404<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export const loadPublicOrg = cache((orgSlug: string) => or404(getPublicOrg(orgSlug)));

export const loadPublicListing = cache((orgSlug: string, listingSlug: string) =>
  or404(getPublicListing(orgSlug, listingSlug)),
);
