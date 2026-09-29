"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type {
  ListingCoverInput,
  ListingInput,
  ListingPhotosInput,
  ListingPublishInput,
  ListingStatusInput,
} from "@/lib/validation/real-estate";
import {
  addListingPhotos,
  archiveListing,
  changeListingStatus,
  createListing,
  removeListingPhoto,
  setListingCover,
  setListingPublished,
  updateListing,
} from "@/services/real-estate/listing-service";
import { listingStatusLabels } from "@/config/real-estate-labels";

function refresh(id?: string) {
  revalidatePath("/listings");
  if (id) revalidatePath(`/listings/${id}`);
}

export async function createListingAction(input: ListingInput) {
  return runAction(async () => {
    const listing = await createListing(await tenantOrThrow(), input);
    refresh();
    return { id: listing.id };
  }, "Listing created");
}

export async function updateListingAction(id: string, input: ListingInput) {
  return runAction(async () => {
    await updateListing(await tenantOrThrow(), id, input);
    refresh(id);
    return { id };
  }, "Listing updated");
}

export async function changeListingStatusAction(id: string, input: ListingStatusInput) {
  return runAction(async () => {
    const listing = await changeListingStatus(await tenantOrThrow(), id, input);
    refresh(id);
    return { status: listing.status };
  }, `Listing marked ${listingStatusLabels[input.status].toLowerCase()}`);
}

export async function setListingPublishedAction(id: string, input: ListingPublishInput) {
  return runAction(async () => {
    const listing = await setListingPublished(await tenantOrThrow(), id, input);
    refresh(id);
    return { isPublished: listing.isPublished };
  }, input.published ? "Listing published" : "Listing unpublished");
}

export async function archiveListingAction(id: string) {
  return runAction(async () => {
    await archiveListing(await tenantOrThrow(), id);
    refresh(id);
    return null;
  }, "Listing archived");
}

export async function addListingPhotosAction(id: string, input: ListingPhotosInput) {
  return runAction(async () => {
    const result = await addListingPhotos(await tenantOrThrow(), id, input);
    refresh(id);
    return result;
  }, "Photos added");
}

export async function setListingCoverAction(id: string, input: ListingCoverInput) {
  return runAction(async () => {
    await setListingCover(await tenantOrThrow(), id, input);
    refresh(id);
    return null;
  }, "Cover photo updated");
}

export async function removeListingPhotoAction(id: string, fileId: string) {
  return runAction(async () => {
    await removeListingPhoto(await tenantOrThrow(), id, fileId);
    refresh(id);
    return null;
  }, "Photo removed");
}
