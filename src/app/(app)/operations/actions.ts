"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type {
  AnnouncementInput,
  ComplaintAssignInput,
  ComplaintEditInput,
  ComplaintInput,
  ComplaintStatusInput,
  MaintenanceAssignInput,
  MaintenanceEditInput,
  MaintenanceInput,
  MaintenancePhotosInput,
  MaintenanceStatusInput,
  VisitorCheckInInput,
} from "@/lib/validation/operations";
import {
  addMaintenancePhotos,
  assignMaintenance,
  createMaintenance,
  listMaintenanceLocations,
  removeMaintenancePhoto,
  updateMaintenance,
  updateMaintenanceStatus,
} from "@/services/operations/maintenance-service";
import {
  assignComplaint,
  createComplaint,
  updateComplaint,
  updateComplaintStatus,
} from "@/services/operations/complaint-service";
import { checkInVisitor, checkOutVisitor } from "@/services/operations/visitor-service";
import {
  archiveAnnouncement,
  createAnnouncement,
  getAnnouncement,
  restoreAnnouncement,
  setAnnouncementPinned,
  updateAnnouncement,
} from "@/services/operations/announcement-service";
import { listAssignableStaff } from "@/services/operations/shared";

// Thin wrappers: resolve the tenant, call the service (which validates and
// authorizes), then revalidate the affected views.

function revalidateMaintenance(id?: string) {
  revalidatePath("/operations/maintenance");
  if (id) revalidatePath(`/operations/maintenance/${id}`);
  revalidatePath("/tasks");
}

function revalidateComplaints(id?: string) {
  revalidatePath("/operations/complaints");
  if (id) revalidatePath(`/operations/complaints/${id}`);
  revalidatePath("/tasks");
}

// ─── Pickers ────────────────────────────────────────────────────────────────

export async function assignableStaffAction(hostelId: string) {
  return runAction(async () => listAssignableStaff(await tenantOrThrow(), hostelId));
}

export async function maintenanceLocationsAction(hostelId: string) {
  return runAction(async () => listMaintenanceLocations(await tenantOrThrow(), hostelId));
}

// ─── Maintenance ────────────────────────────────────────────────────────────

export async function createMaintenanceAction(input: MaintenanceInput) {
  return runAction(async () => {
    const request = await createMaintenance(await tenantOrThrow(), input);
    revalidateMaintenance();
    return { id: request.id, requestNumber: request.requestNumber };
  }, "Maintenance request created");
}

export async function updateMaintenanceAction(id: string, input: MaintenanceEditInput) {
  return runAction(async () => {
    await updateMaintenance(await tenantOrThrow(), id, input);
    revalidateMaintenance(id);
    return { id };
  }, "Request updated");
}

export async function assignMaintenanceAction(id: string, input: MaintenanceAssignInput) {
  return runAction(async () => {
    await assignMaintenance(await tenantOrThrow(), id, input);
    revalidateMaintenance(id);
    return { id };
  }, "Assignment updated");
}

export async function updateMaintenanceStatusAction(id: string, input: MaintenanceStatusInput) {
  return runAction(async () => {
    const updated = await updateMaintenanceStatus(await tenantOrThrow(), id, input);
    revalidateMaintenance(id);
    return { id, status: updated.status };
  }, "Request updated");
}

export async function addMaintenancePhotosAction(id: string, input: MaintenancePhotosInput) {
  return runAction(async () => {
    const result = await addMaintenancePhotos(await tenantOrThrow(), id, input);
    revalidateMaintenance(id);
    return result;
  }, "Photos added");
}

export async function removeMaintenancePhotoAction(id: string, fileId: string) {
  return runAction(async () => {
    await removeMaintenancePhoto(await tenantOrThrow(), id, fileId);
    revalidateMaintenance(id);
    return null;
  }, "Photo removed");
}

// ─── Complaints ─────────────────────────────────────────────────────────────

export async function createComplaintAction(input: ComplaintInput) {
  return runAction(async () => {
    const complaint = await createComplaint(await tenantOrThrow(), input);
    revalidateComplaints();
    return { id: complaint.id, complaintNumber: complaint.complaintNumber };
  }, "Complaint logged");
}

export async function updateComplaintAction(id: string, input: ComplaintEditInput) {
  return runAction(async () => {
    await updateComplaint(await tenantOrThrow(), id, input);
    revalidateComplaints(id);
    return { id };
  }, "Complaint updated");
}

export async function assignComplaintAction(id: string, input: ComplaintAssignInput) {
  return runAction(async () => {
    await assignComplaint(await tenantOrThrow(), id, input);
    revalidateComplaints(id);
    return { id };
  }, "Assignment updated");
}

export async function updateComplaintStatusAction(id: string, input: ComplaintStatusInput) {
  return runAction(async () => {
    const updated = await updateComplaintStatus(await tenantOrThrow(), id, input);
    revalidateComplaints(id);
    return { id, status: updated.status };
  }, "Status updated");
}

// ─── Visitors ───────────────────────────────────────────────────────────────

export async function checkInVisitorAction(input: VisitorCheckInInput) {
  return runAction(async () => {
    const visitor = await checkInVisitor(await tenantOrThrow(), input);
    revalidatePath("/operations/visitors");
    return { id: visitor.id, name: visitor.name };
  });
}

export async function checkOutVisitorAction(id: string) {
  return runAction(async () => {
    const visitor = await checkOutVisitor(await tenantOrThrow(), id);
    revalidatePath("/operations/visitors");
    return { id, name: visitor.name };
  });
}

// ─── Announcements ──────────────────────────────────────────────────────────

export async function getAnnouncementAction(id: string) {
  return runAction(async () => getAnnouncement(await tenantOrThrow(), id));
}

export async function createAnnouncementAction(input: AnnouncementInput) {
  return runAction(async () => {
    const announcement = await createAnnouncement(await tenantOrThrow(), input);
    revalidatePath("/operations/announcements");
    revalidatePath("/tasks");
    return { id: announcement.id, scheduled: announcement.publishedAt > new Date() };
  });
}

export async function updateAnnouncementAction(id: string, input: AnnouncementInput) {
  return runAction(async () => {
    await updateAnnouncement(await tenantOrThrow(), id, input);
    revalidatePath("/operations/announcements");
    revalidatePath("/tasks");
    return { id };
  }, "Announcement updated");
}

export async function setAnnouncementPinnedAction(id: string, pinned: boolean) {
  return runAction(async () => {
    await setAnnouncementPinned(await tenantOrThrow(), id, pinned);
    revalidatePath("/operations/announcements");
    return null;
  }, pinned ? "Pinned to top" : "Unpinned");
}

export async function archiveAnnouncementAction(id: string) {
  return runAction(async () => {
    await archiveAnnouncement(await tenantOrThrow(), id);
    revalidatePath("/operations/announcements");
    revalidatePath("/tasks");
    return null;
  }, "Announcement archived");
}

export async function restoreAnnouncementAction(id: string) {
  return runAction(async () => {
    await restoreAnnouncement(await tenantOrThrow(), id);
    revalidatePath("/operations/announcements");
    return null;
  }, "Announcement restored");
}
