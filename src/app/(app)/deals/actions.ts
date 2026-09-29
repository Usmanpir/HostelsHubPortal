"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type { DealCommissionInput, DealInput, DealStageInput } from "@/lib/validation/real-estate";
import { changeDealStage, createDeal, setDealCommissionPaid, updateDeal } from "@/services/real-estate/deal-service";
import { dealStageLabels } from "@/config/real-estate-labels";

function refresh(deal: { id: string; leadId: string | null; listingId: string | null }) {
  revalidatePath("/deals");
  revalidatePath(`/deals/${deal.id}`);
  if (deal.leadId) revalidatePath(`/leads/${deal.leadId}`);
  if (deal.listingId) revalidatePath(`/listings/${deal.listingId}`);
}

export async function createDealAction(input: DealInput) {
  return runAction(async () => {
    const deal = await createDeal(await tenantOrThrow(), input);
    refresh(deal);
    revalidatePath("/leads");
    return { id: deal.id };
  }, "Deal created");
}

export async function updateDealAction(id: string, input: DealInput) {
  return runAction(async () => {
    const deal = await updateDeal(await tenantOrThrow(), id, input);
    refresh(deal);
    return { id };
  }, "Deal updated");
}

export async function changeDealStageAction(id: string, input: DealStageInput) {
  return runAction(async () => {
    const deal = await changeDealStage(await tenantOrThrow(), id, input);
    refresh(deal);
    revalidatePath("/leads");
    revalidatePath("/listings");
    return { stage: deal.stage };
  }, `Deal moved to ${dealStageLabels[input.stage].toLowerCase()}`);
}

export async function setDealCommissionPaidAction(id: string, input: DealCommissionInput) {
  return runAction(async () => {
    const deal = await setDealCommissionPaid(await tenantOrThrow(), id, input);
    refresh(deal);
    return null;
  }, input.paid ? "Commission marked paid" : "Commission marked unpaid");
}
