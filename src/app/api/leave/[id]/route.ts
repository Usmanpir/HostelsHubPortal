import { readJson, tenantRoute } from "@/lib/api/handler";
import { ValidationError } from "@/lib/errors";
import { reviewLeave } from "@/services/staff/leave-service";

type Params = { id: string };

const DECISIONS = { approve: "APPROVED", reject: "REJECTED", cancel: "CANCELLED" } as const;

/** PATCH /api/leave/:id { "action": "approve" | "reject" | "cancel" } (or { "decision": "APPROVED" | … }) */
export const PATCH = tenantRoute<Params>(async ({ req, params, ctx }) => {
  const body = (await readJson(req)) as { action?: unknown; decision?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : null;
  const decision = action && action in DECISIONS ? DECISIONS[action as keyof typeof DECISIONS] : body?.decision;
  if (typeof decision !== "string") throw new ValidationError('Provide "action": "approve", "reject" or "cancel".');
  return reviewLeave(ctx, params.id, { decision: decision as "APPROVED" | "REJECTED" | "CANCELLED" });
});
