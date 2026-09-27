import "server-only";
import { randomUUID } from "node:crypto";
import { prisma, type DbClient } from "@/lib/db/prisma";
import { ForbiddenError, NotFoundError, PlanLimitError, ValidationError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { EXTENSIONS, safeFileName, validateUpload, type FileKind } from "@/lib/storage/validation";
import { can, canAny, hasHostelAccess, type TenantContext } from "@/lib/tenant/context";
import type { Permission } from "@/lib/permissions/catalog";
import { getSubscription } from "@/lib/subscription/limits";
import type { PlanLimits } from "@/config/plans";

export const UPLOAD_PURPOSES = {
  "resident-document": { kind: "document", permission: "residents.documents" },
  "resident-photo": { kind: "image", permission: "residents.manage" },
  "assignment-document": { kind: "document", permission: "assignments.manage" },
  "staff-document": { kind: "document", permission: "staff.manage" },
  "staff-photo": { kind: "image", permission: "staff.manage" },
  "expense-receipt": { kind: "document", permission: "expenses.manage" },
  "maintenance-photo": { kind: "image", permission: null },
  "organization-logo": { kind: "image", permission: "settings.organization" },
} as const satisfies Record<string, { kind: FileKind; permission: Permission | null }>;

export type UploadPurpose = keyof typeof UPLOAD_PURPOSES;

export function isUploadPurpose(value: string): value is UploadPurpose {
  return value in UPLOAD_PURPOSES;
}

type Uploader = { organizationId: string; userId: string };

async function assertStorageQuota(organizationId: string, adding: number) {
  const sub = await getSubscription(prisma, organizationId);
  const maxMb = (sub?.plan.limits as Partial<PlanLimits> | undefined)?.maxStorageMb;
  if (maxMb === null || maxMb === undefined) return;
  const used = await prisma.storedFile.aggregate({ where: { organizationId, deletedAt: null }, _sum: { size: true } });
  if ((used._sum.size ?? 0) + adding > maxMb * 1024 * 1024) {
    throw new PlanLimitError(`Storage limit of ${maxMb} MB reached. Upgrade your plan or remove old files.`);
  }
}

/**
 * Validate and store an uploaded file. `permission: null` purposes are open to
 * any authenticated member or resident of the organization (e.g. photos on a
 * maintenance request). The file is "pending" until attached to a record.
 */
export async function storeUpload(uploader: Uploader, purpose: UploadPurpose, file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = validateUpload(bytes, UPLOAD_PURPOSES[purpose].kind);
  await assertStorageQuota(uploader.organizationId, bytes.length);
  const key = `${uploader.organizationId}/${purpose}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXTENSIONS[mimeType]}`;
  await getStorage().put(key, bytes, mimeType);
  return prisma.storedFile.create({
    data: {
      organizationId: uploader.organizationId,
      key,
      originalName: safeFileName(file.name),
      mimeType,
      size: bytes.length,
      purpose,
      uploadedById: uploader.userId,
    },
    select: { id: true, originalName: true, size: true, mimeType: true },
  });
}

export function assertCanUpload(ctx: TenantContext, purpose: UploadPurpose) {
  const permission = UPLOAD_PURPOSES[purpose].permission;
  if (permission && !can(ctx, permission)) throw new ForbiddenError();
}

/**
 * Claim a pending upload for a record. Ensures the file belongs to the same
 * organization, was uploaded by this user, has the expected purpose, and is
 * not already attached elsewhere — so file ids from other tenants or users
 * cannot be smuggled into a form.
 */
export async function claimUpload(
  db: DbClient,
  uploader: Uploader,
  fileId: string,
  purposes: UploadPurpose[],
) {
  const file = await db.storedFile.findFirst({
    where: {
      id: fileId,
      organizationId: uploader.organizationId,
      uploadedById: uploader.userId,
      deletedAt: null,
      purpose: { in: purposes },
    },
    include: {
      residentDocument: { select: { id: true } },
      staffDocument: { select: { id: true } },
      residentPhoto: { select: { id: true } },
      staffPhoto: { select: { id: true } },
      expenseReceipt: { select: { id: true } },
      organizationLogo: { select: { id: true } },
    },
  });
  if (!file) throw new ValidationError("The uploaded file could not be found. Please upload it again.");
  const attached =
    file.residentDocument || file.staffDocument || file.residentPhoto || file.staffPhoto || file.expenseReceipt || file.organizationLogo || file.maintenanceRequestId;
  if (attached) throw new ValidationError("This file is already attached to another record.");
  return file;
}

/** Load a file for download after checking the viewer may see the record it belongs to. */
export async function authorizeFileAccess(
  viewer: { ctx: TenantContext | null; residentId: string | null; organizationId: string | null; userId: string },
  fileId: string,
) {
  const organizationIds = [viewer.ctx?.organizationId, viewer.organizationId].filter(Boolean) as string[];
  if (organizationIds.length === 0) throw new NotFoundError("File");
  const file = await prisma.storedFile.findFirst({
    where: { id: fileId, organizationId: { in: organizationIds }, deletedAt: null },
    include: {
      residentDocument: { select: { resident: { select: { id: true, hostelId: true } } } },
      residentPhoto: { select: { id: true, hostelId: true } },
      staffDocument: { select: { staffId: true } },
      staffPhoto: { select: { id: true } },
      expenseReceipt: { select: { hostelId: true } },
      maintenanceRequest: { select: { hostelId: true, residentId: true, assignedStaffId: true } },
      organizationLogo: { select: { id: true } },
    },
  });
  if (!file) throw new NotFoundError("File");

  const ctx = viewer.ctx && viewer.ctx.organizationId === file.organizationId ? viewer.ctx : null;
  const residentId = viewer.organizationId === file.organizationId ? viewer.residentId : null;

  const allowed = (() => {
    if (file.organizationLogo) return true;
    if (file.uploadedById === viewer.userId) return true;
    if (file.residentDocument) {
      const r = file.residentDocument.resident;
      if (residentId === r.id) return true;
      return !!ctx && can(ctx, "residents.documents") && hasHostelAccess(ctx, r.hostelId);
    }
    if (file.residentPhoto) {
      if (residentId === file.residentPhoto.id) return true;
      return !!ctx && canAny(ctx, "residents.view", "residents.manage") && hasHostelAccess(ctx, file.residentPhoto.hostelId);
    }
    if (file.staffDocument) return !!ctx && can(ctx, "staff.manage");
    if (file.staffPhoto) return !!ctx && can(ctx, "staff.view");
    if (file.expenseReceipt) return !!ctx && can(ctx, "expenses.view") && hasHostelAccess(ctx, file.expenseReceipt.hostelId);
    if (file.maintenanceRequest) {
      const m = file.maintenanceRequest;
      if (residentId && residentId === m.residentId) return true;
      if (!ctx) return false;
      if (can(ctx, "maintenance.view") && hasHostelAccess(ctx, m.hostelId)) return true;
      return can(ctx, "maintenance.work") && !!ctx.staffId && ctx.staffId === m.assignedStaffId;
    }
    return false;
  })();
  if (!allowed) throw new NotFoundError("File");
  return file;
}
