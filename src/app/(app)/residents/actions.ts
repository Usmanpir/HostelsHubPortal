"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type {
  ActivateReservationInput,
  BulkResidentStatusInput,
  CancelReservationInput,
  CheckInInput,
  CheckOutInput,
  RequestDecisionInput,
  ResidentDocumentInput,
  ResidentInput,
  TransferInput,
} from "@/lib/validation/resident";
import {
  archiveResident,
  attachResidentDocument,
  bulkSetResidentStatus,
  createResident,
  removeResidentDocument,
  restoreResident,
  updateResident,
} from "@/services/resident/resident-service";
import {
  activateReservation,
  cancelReservation,
  checkIn,
  checkOut,
  getCheckOutPreview,
  getHostelBedMap,
  searchAssignableResidents,
  transfer,
  type AssignableMode,
} from "@/services/resident/assignment-service";
import { decideResidentRequest } from "@/services/resident/request-service";
import { enablePortalAccess, resendPortalSetupLink, revokePortalAccess } from "@/services/resident/portal-access-service";

// Thin wrappers: the services authorize, validate and audit.

/** Bed/room state changes ripple into the hostel screens too. */
function revalidateOccupancy(residentId?: string) {
  revalidatePath("/residents", "layout");
  revalidatePath("/hostels", "layout");
  revalidatePath("/dashboard");
  if (residentId) revalidatePath(`/residents/${residentId}`);
}

// ─── Residents ──────────────────────────────────────────────────────────────

export async function createResidentAction(input: ResidentInput) {
  return runAction(async () => {
    const resident = await createResident(await tenantOrThrow(), input);
    revalidatePath("/residents");
    return { id: resident.id, code: resident.residentCode };
  }, "Resident added");
}

export async function updateResidentAction(id: string, input: ResidentInput) {
  return runAction(async () => {
    await updateResident(await tenantOrThrow(), id, input);
    revalidatePath("/residents");
    revalidatePath(`/residents/${id}`);
    return { id };
  }, "Resident updated");
}

export async function archiveResidentAction(id: string) {
  return runAction(async () => {
    await archiveResident(await tenantOrThrow(), id);
    revalidatePath("/residents", "layout");
    return null;
  }, "Resident archived");
}

export async function restoreResidentAction(id: string) {
  return runAction(async () => {
    const result = await restoreResident(await tenantOrThrow(), id);
    revalidatePath("/residents", "layout");
    return result;
  }, "Resident restored");
}

export async function bulkResidentStatusAction(input: BulkResidentStatusInput) {
  return runAction(async () => {
    const result = await bulkSetResidentStatus(await tenantOrThrow(), input);
    revalidatePath("/residents", "layout");
    return result;
  });
}

export async function attachResidentDocumentAction(residentId: string, input: ResidentDocumentInput) {
  return runAction(async () => {
    const doc = await attachResidentDocument(await tenantOrThrow(), residentId, input);
    revalidatePath(`/residents/${residentId}`);
    return { id: doc.id };
  }, "Document added");
}

export async function removeResidentDocumentAction(documentId: string) {
  return runAction(async () => {
    const { residentId } = await removeResidentDocument(await tenantOrThrow(), documentId);
    revalidatePath(`/residents/${residentId}`);
    return null;
  }, "Document removed");
}

// ─── Portal access ──────────────────────────────────────────────────────────

export async function enablePortalAccessAction(residentId: string) {
  return runAction(async () => {
    const result = await enablePortalAccess(await tenantOrThrow(), residentId);
    revalidatePath(`/residents/${residentId}`);
    return result;
  });
}

export async function resendPortalSetupLinkAction(residentId: string) {
  return runAction(async () => resendPortalSetupLink(await tenantOrThrow(), residentId));
}

export async function revokePortalAccessAction(residentId: string) {
  return runAction(async () => {
    await revokePortalAccess(await tenantOrThrow(), residentId);
    revalidatePath(`/residents/${residentId}`);
    return null;
  }, "Portal access revoked");
}

// ─── Assignments ────────────────────────────────────────────────────────────

export async function checkInAction(input: CheckInInput) {
  return runAction(async () => {
    const result = await checkIn(await tenantOrThrow(), input);
    revalidateOccupancy(result.assignment.residentId);
    if (result.invoiceId) revalidatePath("/finance", "layout");
    return { residentId: result.assignment.residentId, assignmentId: result.assignment.id, status: result.assignment.status, invoiceId: result.invoiceId };
  });
}

export async function activateReservationAction(input: ActivateReservationInput) {
  return runAction(async () => {
    const assignment = await activateReservation(await tenantOrThrow(), input.assignmentId, input.checkInDate);
    revalidateOccupancy(assignment.residentId);
    return { id: assignment.id };
  }, "Resident checked in");
}

export async function cancelReservationAction(input: CancelReservationInput) {
  return runAction(async () => {
    const assignment = await cancelReservation(await tenantOrThrow(), input.assignmentId, input.reason);
    revalidateOccupancy(assignment.residentId);
    return { id: assignment.id };
  }, "Reservation cancelled");
}

export async function transferAction(input: TransferInput) {
  return runAction(async () => {
    const assignment = await transfer(await tenantOrThrow(), input);
    revalidateOccupancy(assignment.residentId);
    return { id: assignment.id };
  }, "Resident transferred");
}

export async function checkOutAction(input: CheckOutInput) {
  return runAction(async () => {
    const result = await checkOut(await tenantOrThrow(), input);
    revalidateOccupancy(result.assignment.residentId);
    if (result.invoiceId || result.refundId) revalidatePath("/finance", "layout");
    return { residentId: result.assignment.residentId, invoiceId: result.invoiceId, refundId: result.refundId };
  }, "Resident checked out");
}

// ─── Workflow lookups (read-only) ───────────────────────────────────────────

export async function searchAssignableResidentsAction(q: string, mode: AssignableMode) {
  return runAction(async () => searchAssignableResidents(await tenantOrThrow(), { q, mode }));
}

export async function hostelBedMapAction(hostelId: string) {
  return runAction(async () => getHostelBedMap(await tenantOrThrow(), hostelId));
}

export async function checkOutPreviewAction(residentId: string) {
  return runAction(async () => getCheckOutPreview(await tenantOrThrow(), residentId));
}

// ─── Requests ───────────────────────────────────────────────────────────────

export async function decideRequestAction(id: string, input: RequestDecisionInput) {
  return runAction(async () => {
    const request = await decideResidentRequest(await tenantOrThrow(), id, input);
    revalidatePath("/residents/requests");
    revalidatePath(`/residents/${request.residentId}`);
    return { id: request.id, status: request.status };
  }, "Request updated");
}
