import { readJson, tenantRoute } from "@/lib/api/handler";
import { transfer } from "@/services/resident/assignment-service";
import type { TransferInput } from "@/lib/validation/resident";

/** POST /api/assignments/transfer — move a resident to another bed, room or hostel. */
export const POST = tenantRoute(async ({ req, ctx }) => transfer(ctx, (await readJson(req)) as TransferInput));
