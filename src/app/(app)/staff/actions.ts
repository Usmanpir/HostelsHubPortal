"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { tenantOrThrow } from "@/lib/tenant/server";
import type {
  ArchiveStaffInput,
  AttendanceBatchInput,
  LeaveInput,
  LeaveReviewInput,
  PayrollComponentsInput,
  PayrollGenerateInput,
  PayrollPayInput,
  StaffDocumentInput,
  StaffInput,
} from "@/lib/validation/staff";
import {
  addStaffDocument,
  archiveStaff,
  createStaff,
  removeStaffDocument,
  restoreStaff,
  updateStaff,
} from "@/services/staff/staff-service";
import { saveAttendance } from "@/services/staff/attendance-service";
import { createLeave, reviewLeave } from "@/services/staff/leave-service";
import {
  cancelPayroll,
  generatePayroll,
  payPayroll,
  reopenPayroll,
  updatePayroll,
} from "@/services/staff/payroll-service";

// Thin wrappers: resolve the tenant, call the service (validates + authorizes), revalidate.

export async function createStaffAction(input: StaffInput) {
  return runAction(async () => {
    const staff = await createStaff(await tenantOrThrow(), input);
    revalidatePath("/staff");
    return { id: staff.id };
  }, "Staff member added");
}

export async function updateStaffAction(id: string, input: StaffInput) {
  return runAction(async () => {
    await updateStaff(await tenantOrThrow(), id, input);
    revalidatePath("/staff", "layout");
    return { id };
  }, "Staff member updated");
}

export async function archiveStaffAction(id: string, input: ArchiveStaffInput) {
  return runAction(async () => {
    await archiveStaff(await tenantOrThrow(), id, input);
    revalidatePath("/staff", "layout");
    return null;
  }, "Staff member archived");
}

export async function restoreStaffAction(id: string) {
  return runAction(async () => {
    await restoreStaff(await tenantOrThrow(), id);
    revalidatePath("/staff", "layout");
    return null;
  }, "Staff member restored");
}

export async function addStaffDocumentAction(staffId: string, input: StaffDocumentInput) {
  return runAction(async () => {
    const doc = await addStaffDocument(await tenantOrThrow(), staffId, input);
    revalidatePath(`/staff/${staffId}`);
    return { id: doc.id };
  }, "Document uploaded");
}

export async function removeStaffDocumentAction(staffId: string, documentId: string) {
  return runAction(async () => {
    await removeStaffDocument(await tenantOrThrow(), documentId);
    revalidatePath(`/staff/${staffId}`);
    return null;
  }, "Document removed");
}

export async function saveAttendanceAction(input: AttendanceBatchInput) {
  return runAction(async () => {
    const result = await saveAttendance(await tenantOrThrow(), input);
    revalidatePath("/staff", "layout");
    return result;
  }, "Attendance saved");
}

export async function createLeaveAction(input: LeaveInput) {
  return runAction(async () => {
    const leave = await createLeave(await tenantOrThrow(), input);
    revalidatePath("/staff", "layout");
    return { id: leave.id };
  }, "Leave request recorded");
}

export async function reviewLeaveAction(id: string, input: LeaveReviewInput) {
  return runAction(async () => {
    await reviewLeave(await tenantOrThrow(), id, input);
    revalidatePath("/staff", "layout");
    return null;
  });
}

export async function generatePayrollAction(input: PayrollGenerateInput) {
  return runAction(async () => {
    const result = await generatePayroll(await tenantOrThrow(), input);
    revalidatePath("/staff/payroll");
    return result;
  });
}

export async function updatePayrollAction(id: string, input: PayrollComponentsInput) {
  return runAction(async () => {
    await updatePayroll(await tenantOrThrow(), id, input);
    revalidatePath("/staff", "layout");
    return { id };
  }, "Salary updated");
}

export async function payPayrollAction(id: string, input: PayrollPayInput) {
  return runAction(async () => {
    await payPayroll(await tenantOrThrow(), id, input);
    revalidatePath("/staff", "layout");
    return { id };
  }, "Salary marked as paid");
}

export async function cancelPayrollAction(id: string) {
  return runAction(async () => {
    await cancelPayroll(await tenantOrThrow(), id);
    revalidatePath("/staff", "layout");
    return null;
  }, "Salary record cancelled");
}

export async function reopenPayrollAction(id: string) {
  return runAction(async () => {
    await reopenPayroll(await tenantOrThrow(), id);
    revalidatePath("/staff", "layout");
    return null;
  }, "Salary record reopened");
}
