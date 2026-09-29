"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { runAction } from "@/lib/actions";
import { residentOrThrow } from "@/lib/tenant/resident";
import type {
  PortalComplaintInput,
  PortalMaintenanceInput,
  PortalProfileInput,
  PortalRequestInput,
} from "@/lib/validation/portal";
import { updatePortalProfile } from "@/services/portal/profile-service";
import { createPortalComplaint } from "@/services/portal/complaint-service";
import { createPortalMaintenance } from "@/services/portal/maintenance-service";
import { cancelPortalRequest, createPortalRequest } from "@/services/portal/request-service";
import { CHECKOUT_COOKIE, startOnlinePayment } from "@/services/payments/online-payment-service";
import type { StartOnlinePaymentInput } from "@/lib/validation/payments";

// Thin wrappers: the resident is always resolved from the session, never from input.

export async function updatePortalProfileAction(input: PortalProfileInput) {
  return runAction(async () => {
    const result = await updatePortalProfile(await residentOrThrow(), input);
    revalidatePath("/portal/profile");
    return result;
  }, "Profile updated");
}

export async function createPortalComplaintAction(input: PortalComplaintInput) {
  return runAction(async () => {
    const complaint = await createPortalComplaint(await residentOrThrow(), input);
    revalidatePath("/portal", "layout");
    return { id: complaint.id, number: complaint.complaintNumber };
  });
}

export async function createPortalMaintenanceAction(input: PortalMaintenanceInput) {
  return runAction(async () => {
    const request = await createPortalMaintenance(await residentOrThrow(), input);
    revalidatePath("/portal", "layout");
    return { id: request.id, number: request.requestNumber };
  });
}

export async function createPortalRequestAction(input: PortalRequestInput) {
  return runAction(async () => {
    const request = await createPortalRequest(await residentOrThrow(), input);
    revalidatePath("/portal/requests");
    return { id: request.id };
  }, "Request submitted");
}

/** Start a hosted-checkout payment; the client auto-submits the returned form to the gateway. */
export async function startOnlinePaymentAction(input: StartOnlinePaymentInput) {
  return runAction(async () => {
    const { form, txnRef } = await startOnlinePayment(await residentOrThrow(), input);
    // Lets multi-step gateways (Easypaisa's Confirm step) find this checkout again.
    // A hint only — it never authorizes anything.
    (await cookies()).set(CHECKOUT_COOKIE, txnRef, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/payments/online",
      maxAge: 60 * 60,
    });
    return { form };
  });
}

export async function cancelPortalRequestAction(id: string) {
  return runAction(async () => {
    await cancelPortalRequest(await residentOrThrow(), id);
    revalidatePath("/portal/requests");
    return null;
  }, "Request cancelled");
}
