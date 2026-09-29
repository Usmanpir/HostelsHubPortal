import { tenantRoute } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { previewResidentImport } from "@/services/resident/import-service";

/** POST multipart { file } → row-by-row validation preview. Nothing is saved. */
export const POST = tenantRoute(async ({ req, ctx }) => {
  await enforceRateLimit(`import:${ctx.userId}`, RATE_LIMITS.upload);
  const form = await req.formData().catch(() => {
    throw new ValidationError("Expected a file upload.");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Choose a CSV or Excel file to upload.");
  return previewResidentImport(ctx, new Uint8Array(await file.arrayBuffer()), file.name);
});
