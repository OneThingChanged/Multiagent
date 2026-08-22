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
    const record = { timestamp: new Date().toISOString(), type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 10, output_tokens: 3, cached_input_tokens: 2, total_tokens: 13 }, total_token_usage: { total_tokens: 13 } }, rate_limits: { limit_id: "codex", limit_name: null, primary: { used_percent: 25, window_minutes: 10_080, resets_at: 1_784_928_404 }, secondary: null, credits: { has_credits: false, unlimited: false, balance: "0" }, plan_type: "pro" } } };
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

  it("persists daily aggregates and rolls up only newly inserted events", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-rollup-")); roots.push(root);
    const databasePath = path.join(root, "usage.db");
    let service = new UsageService(databasePath, { scan: async () => [] });
    let insert = service.db().prepare(`INSERT INTO usage_events (
      source_key, ts, tool, input_tokens, output_tokens, total_tokens, raw_kind
    ) VALUES (?, ?, 'codex', ?, ?, ?, 'test')`);
    const ts = Math.floor(new Date(2026, 7, 8, 12, 0, 0).getTime() / 1000);
    insert.run("first", ts, 80, 20, 100);

    expect(service.dashboardSummary()).toMatchObject({ events: 1, totalTokens: 100 });
    const firstMarker = Number(service.db().prepare(
      "SELECT value FROM usage_meta WHERE key='daily_rollup_event_id'"
    ).get().value);
    service.close();

    service = new UsageService(databasePath, { scan: async () => [] });
    insert = service.db().prepare(`INSERT INTO usage_events (
      source_key, ts, tool, input_tokens, output_tokens, total_tokens, raw_kind
    ) VALUES (?, ?, 'codex', ?, ?, ?, 'test')`);
    insert.run("second", ts + 60, 150, 50, 200);

    expect(service.dashboardSummary()).toMatchObject({ events: 2, totalTokens: 300 });
    expect(Number(service.db().prepare(
      "SELECT value FROM usage_meta WHERE key='daily_rollup_event_id'"
    ).get().value)).toBeGreaterThan(firstMarker);
    expect(service.db().prepare("SELECT events, total_tokens totalTokens FROM usage_daily").get())
      .toMatchObject({ events: 2, totalTokens: 300 });
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

  it("returns selectable week, month, and year history from the local database", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-history-")); roots.push(root);
    const service = new UsageService(path.join(root, "usage.db"), { scan: async () => [] });
    const event = service.db().prepare(`INSERT INTO usage_events (
      source_key, ts, tool, input_tokens, output_tokens, total_tokens, raw_kind
    ) VALUES (?, ?, 'codex', ?, ?, ?, 'test')`);
    const add = (key, year, month, day, tokens) => {
      const date = new Date(year, month - 1, day, 12, 0, 0);
      event.run(key, Math.floor(date.getTime() / 1000), tokens - 10, 10, tokens);
    };
    add("2025-jan", 2025, 1, 5, 100);
    add("2025-dec", 2025, 12, 20, 200);
    add("2026-jul", 2026, 7, 15, 300);
    add("2026-aug-mon", 2026, 8, 3, 400);
    add("2026-aug-tue", 2026, 8, 4, 500);
    add("2026-aug-sat", 2026, 8, 8, 600);
    const now = new Date(2026, 7, 8, 18, 0, 0).getTime();

    const month = service.usageHistory({ mode: "month", year: 2026, month: 8 }, now);
    expect(month.selection).toMatchObject({ mode: "month", year: 2026, month: 8 });
    expect(month.totals).toMatchObject({ events: 3, totalTokens: 1_500 });
    expect(month.previous.totals).toMatchObject({ events: 1, totalTokens: 300 });
    expect(month.buckets).toHaveLength(31);
    expect(month.buckets.find((bucket) => bucket.key === "2026-08-04")).toMatchObject({ totalTokens: 500 });
    expect(month.quickBuckets).toHaveLength(12);
    expect(month.quickBuckets[7]).toMatchObject({ value: 8, totalTokens: 1_500 });
    expect(month.availableYears).toEqual([2026, 2025]);

    const week = service.usageHistory({ mode: "week", year: 2026, week: 32 }, now);
    expect(week.totals).toMatchObject({ events: 3, totalTokens: 1_500 });
    expect(week.buckets).toHaveLength(7);
    expect(week.quickBuckets).toHaveLength(53);
    expect(week.quickBuckets[31]).toMatchObject({ value: 32, totalTokens: 1_500 });

    const year = service.usageHistory({ mode: "year", year: 2025 }, now);
    expect(year.totals).toMatchObject({ events: 2, totalTokens: 300 });
    expect(year.buckets).toHaveLength(12);
    expect(year.buckets[0]).toMatchObject({ label: "1월", totalTokens: 100 });
    expect(year.buckets[11]).toMatchObject({ label: "12월", totalTokens: 200 });
    expect(() => service.usageHistory({ mode: "month", year: 2026, month: 9 }, now)).toThrow(/future/);
    service.close();
  });

  it("uses the ISO week-year at calendar year boundaries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-weekyear-")); roots.push(root);
    const service = new UsageService(path.join(root, "usage.db"), { scan: async () => [] });
    const now = new Date(2027, 0, 1, 12, 0, 0).getTime();

    const history = service.usageHistory({ mode: "week", year: 2026, week: 53 }, now);

    expect(history.current).toMatchObject({ year: 2027, weekYear: 2026, week: 53 });
    expect(history.selection).toMatchObject({ mode: "week", year: 2026, week: 53 });
    expect(history.availableYears[0]).toBe(2026);
    expect(() => service.usageHistory({ mode: "week", year: 2027, week: 1 }, now)).toThrow(/out of range/);
    service.close();
  });

  it("refreshes a current limit from the tail of a recent transcript", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-usage-tail-")); roots.push(root);
    const transcript = path.join(root, "session.jsonl");
    const now = Date.now();
    const oldRecord = { timestamp: new Date(now - 60_000).toISOString(), type: "event_msg", payload: { type: "message", text: "old" } };
    const rateRecord = { timestamp: new Date(now).toISOString(), type: "event_msg", payload: { type: "token_count", rate_limits: { limit_id: "codex", primary: { used_percent: 42, window_minutes: 300, resets_at: 1_784_400_000 }, secondary: null, credits: { has_credits: false, unlimited: false } } } };
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
    const now = Date.now();
    const base = { timestamp: new Date(now).toISOString(), type: "event_msg", payload: { type: "token_count", rate_limits: { limit_id: "codex", primary: { used_percent: 6, window_minutes: 10_080, resets_at: 1 }, secondary: null, credits: {} } } };
    const model = { timestamp: new Date(now + 1_000).toISOString(), type: "event_msg", payload: { type: "token_count", rate_limits: { limit_id: "codex_bengalfox", limit_name: "GPT-5.3-Codex-Spark", primary: { used_percent: 0, window_minutes: 10_080, resets_at: 1 }, secondary: null, credits: {} } } };
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
