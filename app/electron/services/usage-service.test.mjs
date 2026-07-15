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
    const record = { timestamp: "2026-07-15T00:00:00Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 10, output_tokens: 3, cached_input_tokens: 2, total_tokens: 13 }, total_token_usage: { total_tokens: 13 } } } };
    fs.writeFileSync(transcript, `${JSON.stringify(record)}\n`);
    const sessionService = { scan: async () => [{ path: transcript, sessionId: "s1", cwd: root }] };
    const service = new UsageService(path.join(root, "usage.db"), sessionService);
    service.syncCatalog([{ id: "p", name: "P", folder: root }], [{ id: "a", projectId: "p", name: "A", folder: root, aiToolId: "codex", lastSessionId: "s1" }]);
    expect((await service.ingestAll()).events).toBe(1);
    expect((await service.ingestAll()).events).toBe(0);
    expect(service.dashboardSummary()).toMatchObject({ events: 1, totalTokens: 15 });
    service.close();
  });
});
