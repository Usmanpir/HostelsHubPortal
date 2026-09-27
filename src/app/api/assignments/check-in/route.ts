import { readJson, tenantRoute } from "@/lib/api/handler";
import { checkIn } from "@/services/resident/assignment-service";
import type { CheckInInput } from "@/lib/validation/resident";

/** POST /api/assignments/check-in — assign (or reserve) a bed for a resident. */
export const POST = tenantRoute(async ({ req, ctx }) => checkIn(ctx, (await readJson(req)) as CheckInInput));
