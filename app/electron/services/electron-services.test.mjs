import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { HookService, hookInternals } from "./hook-service.mjs";
import { SessionService } from "./session-service.mjs";

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-electron-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fsPromises.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("Electron hook configuration", () => {
  it("preserves user Claude hooks and replaces only MultiAgent entries", () => {
    const existing = JSON.stringify({
      hooks: {
        Stop: [
          { matcher: "user", hooks: [{ type: "command", command: "user-hook" }] },
          { __source: "multiagent", hooks: [{ command: "old" }] },
        ],
      },
    });
    const merged = JSON.parse(hookInternals.mergeClaude(existing, "C:\\helper\\notify.ps1"));
    expect(merged.hooks.Stop).toHaveLength(2);
    expect(merged.hooks.Stop[0].hooks[0].command).toBe("user-hook");
    expect(merged.hooks.Stop[1].__source).toBe("multiagent");
    expect(merged.hooks.UserPromptSubmit[0].hooks[0].command).toContain("notify.ps1");
    expect(merged.hooks.PreToolUse[0].hooks[0].command).toContain("tool-start PreToolUse");
    expect(merged.hooks.PostToolUseFailure[0].hooks[0].command).toContain(
      "working PostToolUseFailure"
    );
    expect(merged.hooks.StopFailure[0].hooks[0].command).toContain("blocked StopFailure");
  });

  it("creates an idempotent managed Codex block", () => {
    const first = hookInternals.mergeCodex('model = "gpt"\n', "C:\\helper\\notify.ps1");
    const second = hookInternals.mergeCodex(first, "C:\\helper\\notify.ps1");
    expect(second).toBe(first);
    expect((first.match(/multiagent electron hooks/g) ?? [])).toHaveLength(2);
    expect(first).toContain("[[hooks.SessionStart]]");
    expect(first).toContain("[[hooks.PermissionRequest]]");
  });

  it("upgrades legacy Tauri Codex entries without removing user hooks", () => {
    const existing = `model = "gpt"

[[hooks.Stop]]
matcher = "user"
[[hooks.Stop.hooks]]
type = "command"
command = "user-hook"

[[hooks.UserPromptSubmit]]
matcher = ""
__source = "multiagent"
[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = "old-helper working"
`;
    const merged = hookInternals.mergeCodex(existing, "C:\\helper\\notify.ps1");
    expect(merged).toContain('command = "user-hook"');
    expect(merged).not.toContain("old-helper");
    expect((merged.match(/__source = "multiagent"/g) ?? [])).toHaveLength(6);
  });

  it.each(["claude", "codex"])("bootstraps %s hooks on a remote project", (tool) => {
    const root = temporaryDirectory();
    const result = spawnSync(process.execPath, ["-e", hookInternals.remoteBootstrap(tool)], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, USERPROFILE: root, HOME: root },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(fs.existsSync(path.join(root, ".multiagent", "notify.mjs"))).toBe(true);
    const target = tool === "claude"
      ? path.join(root, ".claude", "settings.local.json")
      : path.join(root, ".codex", "config.toml");
    expect(fs.readFileSync(target, "utf8")).toContain("multiagent");
  });
});

describe("Electron hook runtime", () => {
  it("repairs active local projects during automatic maintenance", async () => {
    const baseDir = temporaryDirectory();
    const project = path.join(baseDir, "project");
    await fsPromises.mkdir(project);
    const service = new HookService({
      baseDir: path.join(baseDir, "runtime"),
      sendEvent: () => {},
      sessionService: { noteHook: async () => {} },
    });
    try {
      await service.start();
      const entry = {
        id: "agent-maintain",
        name: "Maintain",
        cwd: project,
        aiToolId: "codex",
        ssh: null,
      };
      await expect(service.maintain([entry])).resolves.toMatchObject({
        checkedProjects: 1,
        repairedProjects: 1,
        failures: [],
      });
      await expect(service.maintain([entry])).resolves.toMatchObject({
        checkedProjects: 1,
        repairedProjects: 0,
        failures: [],
      });
      await expect(service.diagnostics()).resolves.toMatchObject({
        lastMaintenance: { checkedProjects: 1, repairedProjects: 0 },
      });
    } finally {
      await service.stop();
    }
  });

  it("accepts authenticated UTF-8 events and rejects a bad token", async () => {
    const baseDir = temporaryDirectory();
    const delivered = [];
    const noted = [];
    const service = new HookService({
      baseDir,
      sendEvent: (name, payload) => delivered.push({ name, payload }),
      sessionService: { noteHook: async (event) => noted.push(event) },
    });
    try {
      const runtime = await service.start();
      const accepted = await fetch(`http://127.0.0.1:${runtime.port}/event`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "agent-1",
          event: "working",
          token: runtime.token,
          prompt: "한글 질문",
          hook_event_name: "PreToolUse",
          tool_name: "AskUserQuestion",
          tool_input: { questions: [{ question: "배포할까요?" }] },
        }),
      });
      const rejected = await fetch(`http://127.0.0.1:${runtime.port}/event`, {
        method: "POST",
        body: JSON.stringify({ id: "agent-1", event: "done", token: "bad" }),
      });
      expect(accepted.status).toBe(200);
      expect(rejected.status).toBe(401);
      expect(delivered[0]).toMatchObject({
        name: "agent:hook-event",
        payload: {
          id: "agent-1",
          event: "working",
          prompt: "한글 질문",
          hook_event_name: "PreToolUse",
          tool_name: "AskUserQuestion",
          tool_input: '{"questions":[{"question":"배포할까요?"}]}',
        },
      });
      expect(noted).toHaveLength(1);
      expect(await service.health()).toBe(true);
      await expect(service.diagnostics()).resolves.toMatchObject({
        healthy: true,
        recentEvents: [{ id: "agent-1", hookEventName: "PreToolUse" }],
      });
    } finally {
      await service.stop();
    }
  });

  it("serves authenticated MiraControl state and guarded session actions", async () => {
    const baseDir = temporaryDirectory();
    const activated = [];
    const inputs = [];
    const service = new HookService({
      baseDir,
      sendEvent: () => {},
      sessionService: { noteHook: async () => {} },
      integrationProvider: () => ({
        schemaVersion: 1,
        app: { status: "ONLINE" },
        sessions: [{
          agentId: "agent-1",
          providerSessionId: "session-1",
          state: "DONE",
        }],
      }),
      activateAgent: async (agentId) => {
        activated.push(agentId);
        return { ok: true, httpStatus: 202, agentId };
      },
      writeAgentInput: async (request) => {
        inputs.push(request);
        return {
          ok: true,
          agentId: request.agentId,
          providerSessionId: request.expectedSessionId,
        };
      },
    });
    try {
      const runtime = await service.start();
      const baseUrl = `http://127.0.0.1:${runtime.port}`;
      const authorization = { authorization: `Bearer ${runtime.token}` };
      const runtimeInfo = JSON.parse(
        await fsPromises.readFile(path.join(baseDir, "hook-info.json"), "utf8")
      );
      expect(runtimeInfo).toMatchObject({
        port: runtime.port,
        token: runtime.token,
        integrationApiVersion: 1,
      });
      expect(runtimeInfo.pid).toBe(process.pid);

      const unauthorized = await fetch(`${baseUrl}/integration/v1/sessions`);
      const browserBlocked = await fetch(`${baseUrl}/integration/v1/sessions`, {
        headers: { ...authorization, origin: "https://example.invalid" },
      });
      const health = await fetch(`${baseUrl}/integration/v1/health`, {
        headers: authorization,
      });
      const sessions = await fetch(`${baseUrl}/integration/v1/sessions`, {
        headers: authorization,
      });
      expect(unauthorized.status).toBe(401);
      expect(browserBlocked.status).toBe(403);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ ok: true, apiVersion: 1 });
      expect(sessions.status).toBe(200);
      expect(await sessions.json()).toMatchObject({
        sessions: [{ agentId: "agent-1", providerSessionId: "session-1" }],
      });

      const activate = await fetch(
        `${baseUrl}/integration/v1/sessions/agent-1/activate`,
        { method: "POST", headers: authorization }
      );
      const input = await fetch(
        `${baseUrl}/integration/v1/sessions/agent-1/input`,
        {
          method: "POST",
          headers: { ...authorization, "content-type": "application/json" },
          body: JSON.stringify({
            text: "이 작업을 진행해 주세요",
            expectedSessionId: "session-1",
          }),
        }
      );
      expect(activate.status).toBe(202);
      expect(input.status).toBe(200);
      expect(activated).toEqual(["agent-1"]);
      expect(inputs).toEqual([{
        agentId: "agent-1",
        text: "이 작업을 진행해 주세요",
        submit: true,
        expectedSessionId: "session-1",
      }]);
    } finally {
      await service.stop();
    }
  });

  it("delivers Korean prompt text through the generated PowerShell helper", async () => {
    const powershell = path.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
    if (!fs.existsSync(powershell)) return;
    const localAppData = temporaryDirectory();
    const baseDir = path.join(localAppData, "com.jintae.multiagent");
    const delivered = [];
    const service = new HookService({
      baseDir,
      sendEvent: (_name, payload) => delivered.push(payload),
      sessionService: { noteHook: async () => {} },
    });
    try {
      const runtime = await service.start();
      const child = spawn(
        powershell,
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(baseDir, "notify.ps1"),
          "tool-start",
          "PreToolUse",
        ],
        {
          env: {
            ...process.env,
            LOCALAPPDATA: localAppData,
            MULTIAGENT_AGENT_ID: "agent-powershell",
            MULTIAGENT_PORT: String(runtime.port),
            MULTIAGENT_TOKEN: runtime.token,
          },
          stdio: ["pipe", "ignore", "pipe"],
          windowsHide: true,
        }
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.stdin.end(JSON.stringify({
        prompt: "한글 질문이 깨지지 않습니다",
        tool_name: "AskUserQuestion",
        tool_input: { question: "계속할까요?" },
      }));
      const exitCode = await new Promise((resolve) => child.once("exit", resolve));
      expect(exitCode, stderr).toBe(0);
      expect(delivered.at(-1)?.prompt).toBe("한글 질문이 깨지지 않습니다");
      expect(delivered.at(-1)).toMatchObject({
        event: "waiting",
        hook_event_name: "PreToolUse",
        tool_name: "AskUserQuestion",
      });
      expect(delivered.at(-1)?.interactive_question).toContain("계속할까요?");
    } finally {
      await service.stop();
    }
  }, 15_000);
});

describe("Electron session resolution", () => {
  it("verifies a preferred transcript and falls back to the latest folder session", async () => {
    const baseDir = temporaryDirectory();
    const transcripts = path.join(baseDir, "transcripts");
    await fsPromises.mkdir(transcripts, { recursive: true });
    const folder = path.join(baseDir, "project");
    await fsPromises.mkdir(folder);
    const firstId = "11111111-1111-4111-8111-111111111111";
    const latestId = "22222222-2222-4222-8222-222222222222";
    await fsPromises.writeFile(
      path.join(transcripts, `${firstId}.jsonl`),
      `${JSON.stringify({ type: "session_meta", payload: { id: firstId, cwd: folder } })}\n`
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fsPromises.writeFile(
      path.join(transcripts, `${latestId}.jsonl`),
      `${JSON.stringify({ type: "session_meta", payload: { id: latestId, cwd: folder } })}\n`
    );
    const service = new SessionService(path.join(baseDir, "state"));
    service.transcriptRoots = () => [transcripts];
    await expect(
      service.resolve({ aiToolId: "codex", folder, preferredSessionId: firstId })
    ).resolves.toBe(firstId);
    await expect(
      service.resolve({ aiToolId: "codex", folder, preferredSessionId: "missing" })
    ).resolves.toBe(latestId);
  });

  it("uses the per-agent hook index without falling into another folder session", async () => {
    const baseDir = temporaryDirectory();
    const transcripts = path.join(baseDir, "transcripts");
    await fsPromises.mkdir(transcripts, { recursive: true });
    const folder = path.join(baseDir, "project");
    await fsPromises.mkdir(folder);
    const otherId = "33333333-3333-4333-8333-333333333333";
    const notedId = "44444444-4444-4444-8444-444444444444";
    await fsPromises.writeFile(
      path.join(transcripts, `${otherId}.jsonl`),
      `${JSON.stringify({ type: "session_meta", payload: { id: otherId, cwd: folder } })}\n`
    );

    const service = new SessionService(path.join(baseDir, "state"));
    service.transcriptRoots = () => [transcripts];
    await service.noteHook({
      id: "agent-a",
      event: "session-start",
      session_id: notedId,
      cwd: folder,
    });

    await expect(
      service.resolve({
        aiToolId: "codex",
        folder,
        preferredSessionId: null,
        agentId: "agent-a",
        allowFolderFallback: false,
      })
    ).resolves.toBe(notedId);
    await expect(
      service.resolve({
        aiToolId: "codex",
        folder,
        preferredSessionId: null,
        agentId: "unknown-agent",
        allowFolderFallback: false,
      })
    ).resolves.toBeNull();
  });
});
