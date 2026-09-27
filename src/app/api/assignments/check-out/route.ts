import { readJson, tenantRoute } from "@/lib/api/handler";
import { checkOut } from "@/services/resident/assignment-service";
import type { CheckOutInput } from "@/lib/validation/resident";

/** POST /api/assignments/check-out — end a stay and settle the security deposit. */
export const POST = tenantRoute(async ({ req, ctx }) => checkOut(ctx, (await readJson(req)) as CheckOutInput));
