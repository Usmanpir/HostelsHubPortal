import { readJson, tenantRoute } from "@/lib/api/handler";
import { attachResidentDocument, listResidentDocuments } from "@/services/resident/resident-service";
import type { ResidentDocumentInput } from "@/lib/validation/resident";

type Params = { id: string };

/** GET /api/residents/[id]/documents → documents with /api/files/[fileId] links */
export const GET = tenantRoute<Params>(async ({ params, ctx }) => listResidentDocuments(ctx, params.id));

/** POST { fileId, type, title } — attach a file uploaded to /api/files with purpose "resident-document". */
export const POST = tenantRoute<Params>(async ({ req, params, ctx }) =>
  attachResidentDocument(ctx, params.id, (await readJson(req)) as ResidentDocumentInput),
);
