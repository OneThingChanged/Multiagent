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

  it("returns calendar day, week, month totals and a zero-filled 30-day timeline", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-periods-")); roots.push(root);
    const service = new UsageService(path.join(root, "usage.db"), { scan: async () => [] });
    const now = new Date(2026, 7, 8, 12, 0, 0);
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
    const event = service.db().prepare(`INSERT INTO usage_events (
      source_key, ts, tool, input_tokens, total_tokens, raw_kind
    ) VALUES (?, ?, 'codex', ?, ?, 'test')`);
    const add = (key, date, tokens) => event.run(
      key,
      Math.floor(date.getTime() / 1000),
      tokens,
      tokens,
    );
    const today = new Date(dayStart); today.setHours(10);
    const thisWeek = new Date(weekStart); thisWeek.setDate(thisWeek.getDate() + 1); thisWeek.setHours(10);
    const thisMonth = new Date(monthStart); thisMonth.setHours(10);
    const previousMonth = new Date(monthStart); previousMonth.setDate(previousMonth.getDate() - 1); previousMonth.setHours(10);
    const old = new Date(dayStart); old.setDate(old.getDate() - 40); old.setHours(10);
    add("today", today, 100);
    add("week", thisWeek, 200);
    add("month", thisMonth, 300);
    add("previous-month", previousMonth, 400);
    add("old", old, 500);

    const overview = service.usageOverview(now.getTime());
    expect(overview.periods.day).toMatchObject({ events: 1, totalTokens: 100 });
    expect(overview.periods.week).toMatchObject({ events: 2, totalTokens: 300 });
    expect(overview.periods.month).toMatchObject({ events: 3, totalTokens: 600 });
    expect(overview.timeline).toHaveLength(30);
    expect(overview.timeline.reduce((sum, bucket) => sum + bucket.totalTokens, 0)).toBe(1_000);
    expect(overview.timeline.at(-1)).toMatchObject({ totalTokens: 100, events: 1 });
    expect(overview.timeline.some((bucket) => bucket.totalTokens === 0)).toBe(true);
    expect(service.dashboardSummary()).toMatchObject({ events: 5, totalTokens: 1_500 });
    service.close();
  });

  it("refreshes a current limit from the tail of a recent transcript", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-tail-")); roots.push(root);
    const transcript = path.join(root, "session.jsonl");
    const oldRecord = { timestamp: "2026-07-14T00:00:00Z", type: "event_msg", payload: { type: "message", text: "old" } };
    const rateRecord = { timestamp: "2026-07-18T00:00:00Z", type: "event_msg", payload: { type: "token_count", rate_limits: { limit_id: "codex", primary: { used_percent: 42, window_minutes: 300, resets_at: 1_784_400_000 }, secondary: null, credits: { has_credits: false, unlimited: false } } } };
    fs.writeFileSync(transcript, `${JSON.stringify(oldRecord)}\n${JSON.stringify(rateRecord)}\n`);
    const sessionService = { scan: async () => [{ path: transcript, sessionId: "s1", mtimeMs: Date.now() }] };
    const service = new UsageService(path.join(root, "usage.db"), sessionService, {
      claudeCredentialsPath: path.join(root, "no-credentials.json"),
    });

    expect(await service.getRateLimits(true)).toMatchObject({
      limits: [{
        limitId: "codex",
        primary: { usedPercent: 42, windowMinutes: 300, resetsAt: 1_784_400_000 },
      }],
    });
    service.close();
  });

  it("keeps the canonical Codex limit but drops per-model codex ceilings", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-codexmodel-")); roots.push(root);
    const base = { timestamp: "2026-07-18T00:00:00Z", type: "event_msg", payload: { type: "token_count", rate_limits: { limit_id: "codex", primary: { used_percent: 6, window_minutes: 10_080, resets_at: 1 }, secondary: null, credits: {} } } };
    const model = { timestamp: "2026-07-18T00:00:01Z", type: "event_msg", payload: { type: "token_count", rate_limits: { limit_id: "codex_bengalfox", limit_name: "GPT-5.3-Codex-Spark", primary: { used_percent: 0, window_minutes: 10_080, resets_at: 1 }, secondary: null, credits: {} } } };
    const transcript = path.join(root, "session.jsonl");
    fs.writeFileSync(transcript, `${JSON.stringify(base)}\n${JSON.stringify(model)}\n`);
    const service = new UsageService(path.join(root, "usage.db"), { scan: async () => [{ path: transcript, sessionId: "s1", mtimeMs: Date.now() }] }, {
      claudeCredentialsPath: path.join(root, "no-credentials.json"),
    });
    const ids = (await service.getRateLimits(true)).limits.map((limit) => limit.limitId);
    expect(ids).toContain("codex");
    expect(ids).not.toContain("codex_bengalfox");
    service.close();
  });

  it("maps the Claude OAuth usage endpoint into rate-limit rows", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-claude-")); roots.push(root);
    const usage = {
      five_hour: { utilization: 3, resets_at: "2026-07-18T02:10:00+00:00" },
      seven_day: { utilization: 25, resets_at: "2026-07-21T14:00:00+00:00" },
      extra_usage: { is_enabled: false },
      spend: { enabled: false, balance: null },
      limits: [
        { kind: "session", group: "session", percent: 3 },
        { kind: "weekly_all", group: "weekly", percent: 25 },
        {
          kind: "weekly_scoped", group: "weekly", percent: 42,
          resets_at: "2026-07-21T14:00:00+00:00",
          scope: { model: { id: null, display_name: "Fable" } },
        },
      ],
    };
    const service = new UsageService(path.join(root, "usage.db"), { scan: async () => [] }, {
      claudeUsageFetcher: async () => ({ usage, subscriptionType: "max" }),
    });

    const summary = await service.getRateLimits(true);
    const base = summary.limits.find((limit) => limit.limitId === "claude");
    expect(base).toMatchObject({
      limitName: "Claude",
      planType: "max",
      primary: { usedPercent: 3, windowMinutes: 300, resetsAt: Math.floor(Date.parse(usage.five_hour.resets_at) / 1000) },
      secondary: { usedPercent: 25, windowMinutes: 10_080 },
    });
    const scoped = summary.limits.find((limit) => limit.limitId === "claude:weekly_scoped:fable");
    expect(scoped).toMatchObject({
      limitName: "Claude Fable",
      primary: { usedPercent: 42, windowMinutes: 10_080 },
    });
    service.close();
  });

  it("skips Claude limits when no credentials are available", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-nocreds-")); roots.push(root);
    const service = new UsageService(path.join(root, "usage.db"), { scan: async () => [] }, {
      claudeCredentialsPath: path.join(root, "missing-credentials.json"),
    });
    expect(await service.fetchClaudeUsage()).toBeNull();
    expect((await service.getRateLimits(true)).limits).toEqual([]);
    service.close();
  });
});
