import { z } from "zod";
import { readJson, tenantRoute } from "@/lib/api/handler";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseInput } from "@/lib/validation/parse";
import { IMPORT_COLUMNS } from "@/lib/validation/resident-import";
import { importResidentBatch } from "@/services/resident/import-service";

// Large batches can take a while (each row runs the full create + check-in rules).
export const maxDuration = 120;

const rowData = z.object(
  Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, z.string().max(2000).optional()])) as Record<(typeof IMPORT_COLUMNS)[number]["key"], z.ZodOptional<z.ZodString>>,
);
const batchSchema = z.object({
  rows: z.array(z.object({ rowNumber: z.number().int().min(1).max(100000), data: rowData })).min(1).max(200),
});

/** POST /api/residents/import { rows: [{ rowNumber, data }] } → per-row results. Re-validates everything. */
export const POST = tenantRoute(async ({ req, ctx }) => {
  await enforceRateLimit(`import:${ctx.userId}`, RATE_LIMITS.upload);
  const { rows } = parseInput(batchSchema, await readJson(req));
  return importResidentBatch(ctx, rows);
});
