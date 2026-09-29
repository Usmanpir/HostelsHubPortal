import { tenantRoute } from "@/lib/api/handler";
import { removeListingPhoto } from "@/services/real-estate/listing-service";

/** DELETE /api/listings/:id/photos/:fileId — remove a photo (soft delete). */
export const DELETE = tenantRoute<{ id: string; fileId: string }>(async ({ params, ctx }) => {
  await removeListingPhoto(ctx, params.id, params.fileId);
  return null;
});
