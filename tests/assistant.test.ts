import { describe, expect, it, beforeAll } from "vitest";
import { buildAssistantTools } from "@/services/assistant/tools";
import { askAssistant } from "@/services/assistant/assistant-service";
import { BusinessRuleError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import { addMember, createHostelWithRoom, createResidentRow, createTenant } from "./helpers";


async function call(ctx: TenantContext, name: string, input: Record<string, unknown> = {}) {
  const tool = buildAssistantTools(ctx).find((t) => t.name === name);
  if (!tool) throw new Error(`No tool ${name}`);
  return tool.run(tool.inputSchema.parse(input));
}

describe("assistant tools", () => {
  let owner: TenantContext;
  let other: TenantContext;
  let foreignResidentId: string;

  beforeAll(async () => {
    const a = await createTenant("Assistant Org");
    const s = await createHostelWithRoom(a.ctx);
    owner = s.ctx;
    await createResidentRow(owner, s.hostel.id, "Zubair");
    const b = await createTenant("Assistant Other Org");
    const t = await createHostelWithRoom(b.ctx);
    other = t.ctx;
    foreignResidentId = (await createResidentRow(other, t.hostel.id, "Secretname")).id;
  });

  it("every tool runs and returns JSON for an owner", async () => {
    const inputs: Record<string, Record<string, unknown>> = {
      get_resident_details: { residentId: "missing" },
      run_report: { report: "occupancy" },
    };
    for (const tool of buildAssistantTools(owner)) {
      const out = await call(owner, tool.name, inputs[tool.name] ?? {});
      expect(() => JSON.parse(out.replace(/… \[truncated\]$/, ""))).not.toThrow();
    }
  });

  it("only returns the caller's tenant data", async () => {
    const mine = await call(owner, "search_residents", { q: "Zubair" });
    expect(mine).toContain("Zubair");
    const leak = await call(owner, "search_residents", { q: "Secretname" });
    expect(leak).not.toContain("Secretname");
    // Knowing another tenant's resident id doesn't help.
    const foreign = await call(owner, "get_resident_details", { residentId: foreignResidentId });
    expect(foreign).toContain("NOT_FOUND");
    expect(foreign).not.toContain("Secretname");
  });

  it("reports permission errors instead of data", async () => {
    const accountant = await addMember(owner, "ACCOUNTANT");
    const out = await call(accountant, "search_residents", { q: "Zubair" });
    expect(out).toContain("FORBIDDEN");
    expect(out).not.toContain("Zubair");
  });

  it("refuses cleanly when no API key is configured", async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await expect(askAssistant(owner, { messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(BusinessRuleError);
    if (saved) process.env.GEMINI_API_KEY = saved;
  });
});
