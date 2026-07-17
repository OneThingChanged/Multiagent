import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UsageService } from "./usage-service.mjs";

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("Electron usage index", () => {
  it("incrementally indexes Codex token events without duplicates", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-")); roots.push(root);
    const transcript = path.join(root, "session.jsonl");
    const record = { timestamp: "2026-07-15T00:00:00Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 10, output_tokens: 3, cached_input_tokens: 2, total_tokens: 13 }, total_token_usage: { total_tokens: 13 } }, rate_limits: { limit_id: "codex", limit_name: null, primary: { used_percent: 25, window_minutes: 10_080, resets_at: 1_784_928_404 }, secondary: null, credits: { has_credits: false, unlimited: false, balance: "0" }, plan_type: "pro" } } };
    fs.writeFileSync(transcript, `${JSON.stringify(record)}\n`);
    const sessionService = { scan: async () => [{ path: transcript, sessionId: "s1", cwd: root }] };
    const service = new UsageService(path.join(root, "usage.db"), sessionService);
    service.syncCatalog([{ id: "p", name: "P", folder: root }], [{ id: "a", projectId: "p", name: "A", folder: root, aiToolId: "codex", lastSessionId: "s1" }]);
    expect((await service.ingestAll()).events).toBe(1);
    expect((await service.ingestAll()).events).toBe(0);
    expect(service.dashboardSummary()).toMatchObject({ events: 1, totalTokens: 15 });
    expect(service.rateLimitSummary()).toMatchObject({
      limits: [{
        limitId: "codex",
        planType: "pro",
        primary: { usedPercent: 25, windowMinutes: 10_080, resetsAt: 1_784_928_404 },
      }],
    });
    service.close();
  });

  it("refreshes a current limit from the tail of a recent transcript", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-tail-")); roots.push(root);
    const transcript = path.join(root, "session.jsonl");
    const oldRecord = { timestamp: "2026-07-14T00:00:00Z", type: "event_msg", payload: { type: "message", text: "old" } };
    const rateRecord = { timestamp: "2026-07-18T00:00:00Z", type: "event_msg", payload: { type: "token_count", rate_limits: { limit_id: "codex", primary: { used_percent: 42, window_minutes: 300, resets_at: 1_784_400_000 }, secondary: null, credits: { has_credits: false, unlimited: false } } } };
    fs.writeFileSync(transcript, `${JSON.stringify(oldRecord)}\n${JSON.stringify(rateRecord)}\n`);
    const sessionService = { scan: async () => [{ path: transcript, sessionId: "s1", mtimeMs: Date.now() }] };
    const service = new UsageService(path.join(root, "usage.db"), sessionService);

    expect(await service.getRateLimits(true)).toMatchObject({
      limits: [{
        limitId: "codex",
        primary: { usedPercent: 42, windowMinutes: 300, resetsAt: 1_784_400_000 },
      }],
    });
    service.close();
  });
});
