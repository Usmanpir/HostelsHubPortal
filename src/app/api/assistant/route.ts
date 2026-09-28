import { readJson, tenantRoute } from "@/lib/api/handler";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { askAssistant, isAssistantConfigured, type AssistantRequest } from "@/services/assistant/assistant-service";

// A question can take several model round-trips with tool calls.
export const maxDuration = 120;

/** GET /api/assistant → whether the assistant is enabled on this deployment */
export const GET = tenantRoute(async () => ({ enabled: isAssistantConfigured() }));

/** POST /api/assistant { messages: [{ role, content }] } → { answer, toolsUsed } */
export const POST = tenantRoute(async ({ req, ctx }) => {
  await enforceRateLimit(`assistant:${ctx.userId}`, RATE_LIMITS.assistant);
  return askAssistant(ctx, (await readJson(req)) as AssistantRequest);
});
