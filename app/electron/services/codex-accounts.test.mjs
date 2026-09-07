import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAccounts } from "./codex-accounts.mjs";
import { SessionService } from "./session-service.mjs";
import { UsageService } from "./usage-service.mjs";

const roots = [];
function temporary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-accounts-test-"));
  roots.push(root); return root;
}
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    if (!path.basename(root).startsWith("multiagent-accounts-test-") || path.dirname(root) !== path.resolve(os.tmpdir())) throw new Error("Unexpected cleanup path");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Codex account isolation", () => {
  it("keeps independent quota snapshots for different Codex accounts", () => {
    const root = temporary();
    const accounts = new CodexAccounts(root);
    const a = accounts.create("Personal"); const b = accounts.create("Work");
    const usage = new UsageService(path.join(root, "usage.db"), { scan: async () => [] });
    usage.codexAccountForPath = (file) => accounts.accountForPath(file);
    try {
      for (const [id, percent] of [[a, 10], [b, 90]]) {
        usage.captureRateLimits({ timestamp: new Date().toISOString(), payload: {
          type: "token_count", rate_limits: { limit_id: "codex", primary: { used_percent: percent, window_minutes: 300 } },
        } }, path.join(accounts.home(id), "sessions", "test.jsonl"));
      }
      const limits = usage.rateLimitSummary().limits;
      expect(limits).toHaveLength(2);
      expect(limits.find((l) => l.limitId === `codex:${a}`).primary.usedPercent).toBe(10);
      expect(limits.find((l) => l.limitId === `codex:${b}`).primary.usedPercent).toBe(90);
    } finally { usage.close(); }
  });
  it("keeps the default home and credentials unchanged, isolates additional accounts across reload", () => {
    const root = temporary();
    const baseEnv = { CODEX_HOME: path.join(root, "existing"), OPENAI_API_KEY: "fixture-only", CODEX_ACCESS_TOKEN: "fixture-only", PATH: "tools" };
    const service = new CodexAccounts(root, { baseEnv });
    const a = service.create("Personal"); const b = service.create("Work");
    expect(service.environment()).toEqual(baseEnv);
    expect(service.environment(a)).toEqual({ CODEX_HOME: service.home(a), PATH: "tools" });
    expect(service.home(a)).not.toBe(service.home(b));
    expect(service.home()).toBe(baseEnv.CODEX_HOME);
    expect(new CodexAccounts(root, { baseEnv }).list()).toEqual(service.list());
    expect(service.roots()).toHaveLength(3);
    expect(service.accountForPath(path.join(service.home(b), "sessions", "test.jsonl"))).toMatchObject({ id: b });
    expect(service.accountForPath(path.join(service.home(b), "sessions-other", "test.jsonl"))).toBeNull();
    expect(() => service.home("../../outside")).toThrow();
    expect(() => service.create(" ")).toThrow();
  });

  it("reports login completion without exposing OAuth output or auth contents", () => {
    const root = temporary(); let finish; let output;
    const startLogin = vi.fn(() => ({ onData: (fn) => { output = fn; }, onExit: (fn) => { finish = fn; }, kill: vi.fn() }));
    const service = new CodexAccounts(root, { startLogin, baseEnv: {} });
    const id = service.create("Work");
    service.beginLogin(id);
    expect(service.list()[1].state).toBe("pending");
    expect(() => service.beginLogin(id)).toThrow();
    output("secret fixture output");
    fs.writeFileSync(path.join(service.home(id), "auth.json"), '{"fixture":"secret"}');
    finish({ exitCode: 0 });
    expect(service.list()[1].state).toBe("saved");
    expect(JSON.stringify(service.list())).not.toContain("secret");
    expect(startLogin.mock.calls[0][0].CODEX_HOME).toBe(service.home(id));
  });

  it("cancels only its login process and ignores late completion", () => {
    vi.useFakeTimers();
    let finish; const kill = vi.fn();
    const service = new CodexAccounts(temporary(), { startLogin: () => ({ onData() {}, onExit(fn) { finish = fn; }, kill }) });
    const id = service.create("Work"); service.beginLogin(id);
    vi.advanceTimersByTime(5 * 60_000);
    expect(kill).toHaveBeenCalledTimes(1);
    finish({ exitCode: 0 });
    expect(service.list()[1].state).toBe("cancelled");
    expect(service.login).toBeNull();
  });

  it("keeps corrupt registry data intact and does not crash default-home startup", () => {
    const root = temporary(); const service = new CodexAccounts(root);
    service.create("Work"); fs.writeFileSync(service.registry, "invalid");
    const restored = new CodexAccounts(root);
    expect(restored.home()).toBeTruthy();
    expect(() => restored.create("New")).toThrow();
    expect(fs.readFileSync(service.registry, "utf8")).toBe("invalid");
  });

  it("resolves only the selected account, rejecting another account's hook note and session id", async () => {
    const root = temporary(); const accounts = new CodexAccounts(root, { baseEnv: { CODEX_HOME: path.join(root, "default") } });
    const a = accounts.create("A"); const b = accounts.create("B");
    const sidA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const sidB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    for (const [id, sid] of [[a, sidA], [b, sidB]]) {
      const sessions = path.join(accounts.home(id), "sessions"); fs.mkdirSync(sessions);
      fs.writeFileSync(path.join(sessions, `${sid}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id: sid, cwd: root } }));
    }
    const service = new SessionService(root); service.codexRoots = () => accounts.roots();
    service.notes.set("agent", { sessionId: sidA, cwd: root, transcriptPath: path.join(accounts.home(a), "sessions", `${sidA}.jsonl`) });
    const args = { aiToolId: "codex", folder: root, agentId: "agent", transcriptRoot: path.join(accounts.home(b), "sessions"), allowFolderFallback: false };
    expect(await service.resolve(args)).toBeNull();
    expect(await service.resolve({ ...args, preferredSessionId: sidA })).toBeNull();
    expect(await service.resolve({ ...args, preferredSessionId: sidB })).toBe(sidB);
    expect(await service.scan("codex")).toHaveLength(2);
  });
});
