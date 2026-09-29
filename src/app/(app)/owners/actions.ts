"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type { CreatePayoutInput, OwnerInput, OwnerPropertiesInput, PayPayoutInput } from "@/lib/validation/owners";
import {
  archiveOwner,
  createOwner,
  listLinkableProperties,
  restoreOwner,
  setOwnerProperties,
  updateOwner,
} from "@/services/owners/owner-service";
import { cancelPayout, createPayout, markPayoutPaid } from "@/services/owners/payout-service";

// Thin wrappers: resolve the tenant, call the service (which validates and
// authorizes), then revalidate the affected views.

function revalidateOwner(id?: string) {
  revalidatePath("/owners");
  if (id) revalidatePath(`/owners/${id}`, "layout");
}

export async function createOwnerAction(input: OwnerInput) {
  return runAction(async () => {
    const owner = await createOwner(await tenantOrThrow(), input);
    revalidateOwner();
    return { id: owner.id };
  }, "Owner added");
}

export async function updateOwnerAction(id: string, input: OwnerInput) {
  return runAction(async () => {
    await updateOwner(await tenantOrThrow(), id, input);
    revalidateOwner(id);
    return { id };
  }, "Owner updated");
}

export async function archiveOwnerAction(id: string, unlink: boolean) {
  return runAction(async () => {
    await archiveOwner(await tenantOrThrow(), id, { unlink });
    revalidateOwner(id);
    revalidatePath("/hostels", "layout");
    return null;
  }, "Owner archived");
}

export async function restoreOwnerAction(id: string) {
  return runAction(async () => {
    await restoreOwner(await tenantOrThrow(), id);
    revalidateOwner(id);
    return null;
  }, "Owner restored");
}

export async function linkablePropertiesAction(ownerId: string) {
  return runAction(async () => listLinkableProperties(await tenantOrThrow(), ownerId));
}

export async function setOwnerPropertiesAction(ownerId: string, input: OwnerPropertiesInput) {
  return runAction(async () => {
    const result = await setOwnerProperties(await tenantOrThrow(), ownerId, input);
    revalidateOwner(ownerId);
    revalidatePath("/hostels", "layout");
    return result;
  }, "Properties updated");
}

export async function createPayoutAction(input: CreatePayoutInput) {
  return runAction(async () => {
    const payout = await createPayout(await tenantOrThrow(), input);
    revalidateOwner(payout.ownerId);
    revalidatePath("/owners/payouts");
    return { id: payout.id };
  }, "Payout created");
}

export async function markPayoutPaidAction(id: string, input: PayPayoutInput) {
  return runAction(async () => {
    const payout = await markPayoutPaid(await tenantOrThrow(), id, input);
    revalidateOwner(payout.ownerId);
    revalidatePath("/owners/payouts");
    return { id };
  }, "Payout marked as paid");
}

export async function cancelPayoutAction(id: string, reason?: string) {
  return runAction(async () => {
    const payout = await cancelPayout(await tenantOrThrow(), id, { reason });
    revalidateOwner(payout.ownerId);
    revalidatePath("/owners/payouts");
    return null;
  }, "Payout cancelled");
}
