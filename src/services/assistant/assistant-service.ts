import "server-only";
import { ApiError, GoogleGenAI, type Content, type FunctionCall, type FunctionDeclaration, type Part } from "@google/genai";
import { z } from "zod";
import { AppError, BusinessRuleError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { actorOf, type TenantContext } from "@/lib/tenant/context";
import { parseInput } from "@/lib/validation/parse";
import { todayInTimeZone } from "@/lib/format";
import { buildAssistantTools, type AssistantTool } from "./tools";

/** Free-tier friendly default; override with GEMINI_MODEL (e.g. "gemini-pro-latest"). */
const DEFAULT_MODEL = "gemini-flash-latest";
/** Used when the primary model is overloaded (free-tier 503s are common). Override with GEMINI_FALLBACK_MODEL. */
const DEFAULT_FALLBACK_MODEL = "gemini-flash-lite-latest";
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type GenerateParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

/**
 * generateContent with short retries on transient errors, then a switch to the
 * fallback model. `models` is shared across the tool loop so once we fall back
 * we stay on the fallback for the rest of the answer.
 */
async function generate(models: string[], params: Omit<GenerateParams, "model">) {
  for (;;) {
    const model = models[0]!;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { model, response: await getClient().models.generateContent({ ...params, model }) };
      } catch (error) {
        if (!(error instanceof ApiError) || !RETRYABLE_STATUS.has(error.status)) throw error;
        console.warn(`[assistant] ${model} returned ${error.status}, attempt ${attempt + 1}`);
        if (attempt === 0) await sleep(1200);
        else if (models.length === 1) throw error;
      }
    }
    models.shift();
  }
}
const MAX_TURNS_KEPT = 12;
const MAX_TOOL_ROUNDS = 8;

export const assistantRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1]!.role === "user", "The last message must be from the user"),
});
export type AssistantRequest = z.input<typeof assistantRequestSchema>;

export type AssistantReply = { answer: string; toolsUsed: string[] };

let client: GoogleGenAI | undefined;

export function isAssistantConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

function getClient() {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

const INSTRUCTIONS = `You are the HostelHub assistant, built into a hostel management platform used by hostel owners and their staff.

Answer questions about the user's own organization: hostels, occupancy, rooms and beds, residents, staff, invoices, payments, expenses, maintenance, complaints, visitors and reports.

How to work:
- Get facts from the tools. Never invent names, numbers or dates; if the tools don't return something, say you couldn't find it.
- A tool may report a permission error. Tell the user their role doesn't include access to that area rather than guessing.
- Prefer one broad tool (get_dashboard_summary, run_report) before many narrow calls, and call independent tools in parallel.
- Amounts are in the organization's currency; format them with the currency code and thousands separators.
- Be concise: lead with the direct answer, then supporting detail. Use short bullet lists or a small markdown table when comparing several items.
- When it helps, point to the page where the user can act, as a relative markdown link, e.g. [Invoices](/finance/invoices), [Room map](/hostels/map), a resident profile at /residents/<id>, an invoice at /finance/invoices/<id>.
- You can only read data. If asked to create, change or delete something, explain where in the app to do it.
- Stay on topic; politely decline requests unrelated to running the organization.`;

function contextBlock(ctx: TenantContext) {
  const today = todayInTimeZone(ctx.organization.timezone || "UTC");
  const scope = ctx.activeHostelId
    ? "The user is viewing a single hostel (header switcher); tools default to it."
    : ctx.allHostels
      ? "The user is viewing all hostels."
      : "The user can access only some hostels; tools are limited to those.";
  return `Context:
- Organization: ${ctx.organization.name}
- Currency: ${ctx.organization.currency}; time zone: ${ctx.organization.timezone}
- Today: ${today}
- User: ${ctx.userName}, role: ${ctx.roleName}
- ${scope}`;
}

/** Gemini function declaration from a tool's Zod schema (JSON Schema, minus the $schema key). */
function toDeclaration(tool: AssistantTool): FunctionDeclaration {
  const { $schema: _schema, ...schema } = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
  const hasParams = Object.keys((schema.properties as object | undefined) ?? {}).length > 0;
  return { name: tool.name, description: tool.description, ...(hasParams ? { parametersJsonSchema: schema } : {}) };
}

/** Run one model-requested call. Arguments are untrusted model output, so validate them first. */
async function execute(tools: AssistantTool[], call: FunctionCall): Promise<Part> {
  const tool = tools.find((t) => t.name === call.name);
  let result: string;
  if (!tool) {
    result = JSON.stringify({ error: "UNKNOWN_TOOL", message: `No tool named ${call.name}` });
  } else {
    const parsed = tool.inputSchema.safeParse(call.args ?? {});
    result = parsed.success
      ? await tool.run(parsed.data)
      : JSON.stringify({ error: "INVALID_ARGUMENTS", message: parsed.error.issues.map((i) => i.message).join("; ") });
  }
  return { functionResponse: { id: call.id, name: call.name, response: { result } } };
}

/**
 * Answer a question about the member's organization. The model can only use
 * read-only tools bound to this TenantContext, so the reply never contains
 * data the member couldn't open in the app themselves.
 */
export async function askAssistant(ctx: TenantContext, raw: AssistantRequest): Promise<AssistantReply> {
  if (!isAssistantConfigured()) {
    throw new BusinessRuleError("The assistant isn't configured. Set GEMINI_API_KEY on the server to enable it.");
  }
  const { messages } = parseInput(assistantRequestSchema, raw);
  const trimmed = messages.slice(-MAX_TURNS_KEPT);
  while (trimmed.length && trimmed[0]!.role !== "user") trimmed.shift();
  const contents: Content[] = trimmed.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const tools = buildAssistantTools(ctx);
  const config = {
    systemInstruction: `${INSTRUCTIONS}\n\n${contextBlock(ctx)}`,
    tools: [{ functionDeclarations: tools.map(toDeclaration) }],
    maxOutputTokens: 8192,
  };
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallback = process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  const models = [...new Set([primary, fallback])];
  let model = primary;
  const toolsUsed = new Set<string>();
  let answer = "";
  let stop: string | undefined;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const result = await generate(models, { contents, config });
      model = result.model;
      const response = result.response;
      const candidate = response.candidates?.[0];
      stop = response.promptFeedback?.blockReason ?? candidate?.finishReason;
      const calls = response.functionCalls ?? [];

      if (calls.length === 0 || round === MAX_TOOL_ROUNDS) {
        answer = response.text?.trim() ?? "";
        if (calls.length > 0) stop = "TOOL_LIMIT";
        break;
      }
      // Keep the model turn as returned (it carries thought signatures Gemini needs back).
      if (candidate?.content) contents.push(candidate.content);
      for (const call of calls) if (call.name) toolsUsed.add(call.name);
      const results = await Promise.all(calls.map((call) => execute(tools, call)));
      contents.push({ role: "user", parts: results });
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) throw new AppError("RATE_LIMITED", "The assistant has hit its usage limit. Please try again in a minute.", 429);
      if (error.status === 400 || error.status === 401 || error.status === 403) {
        console.error("[assistant] Gemini rejected the request", error.status, error.message);
        throw new AppError("INTERNAL_ERROR", "The assistant's Gemini API key or model setting is invalid.", 500);
      }
      console.error("[assistant] Gemini API error", error.status, error.message);
      if (RETRYABLE_STATUS.has(error.status)) {
        throw new AppError("INTERNAL_ERROR", "Gemini is overloaded right now. Please try again in a moment.", 503);
      }
      throw new AppError("INTERNAL_ERROR", "The assistant couldn't answer right now. Please try again.", 502);
    }
    throw error;
  }

  let text = answer || "I couldn't find an answer to that. Try rephrasing, or ask about a specific hostel, resident or report.";
  if (stop === "SAFETY" || stop === "PROHIBITED_CONTENT" || stop === "BLOCKLIST") text = "I can't help with that request.";
  else if (stop === "MAX_TOKENS") text += "\n\n_(Answer truncated. Ask a narrower question for the rest.)_";
  else if (stop === "TOOL_LIMIT" && !answer) text = "That question needed more lookups than I'm allowed in one answer. Try narrowing it down.";

  await audit(actorOf(ctx), {
    action: "assistant.query",
    entityType: "Assistant",
    metadata: { model, tools: [...toolsUsed], stopReason: stop ?? null },
  });
  return { answer: text, toolsUsed: [...toolsUsed] };
}
