"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type { ViewingInput, ViewingOutcomeInput, ViewingRescheduleInput } from "@/lib/validation/real-estate";
import { recordViewingOutcome, rescheduleViewing, scheduleViewing } from "@/services/real-estate/viewing-service";
import { viewingStatusLabels } from "@/config/real-estate-labels";

function refresh(viewing: { leadId: string; listingId: string }) {
  revalidatePath("/leads/viewings");
  revalidatePath("/leads");
  revalidatePath(`/leads/${viewing.leadId}`);
  revalidatePath(`/listings/${viewing.listingId}`);
}

export async function scheduleViewingAction(input: ViewingInput) {
  return runAction(async () => {
    const viewing = await scheduleViewing(await tenantOrThrow(), input);
    refresh(viewing);
    return { id: viewing.id };
  }, "Viewing scheduled");
}

export async function rescheduleViewingAction(id: string, input: ViewingRescheduleInput) {
  return runAction(async () => {
    const viewing = await rescheduleViewing(await tenantOrThrow(), id, input);
    refresh(viewing);
    return null;
  }, "Viewing rescheduled");
}

export async function recordViewingOutcomeAction(id: string, input: ViewingOutcomeInput) {
  return runAction(async () => {
    const viewing = await recordViewingOutcome(await tenantOrThrow(), id, input);
    refresh(viewing);
    return null;
  }, `Viewing marked ${viewingStatusLabels[input.status].toLowerCase()}`);
}
