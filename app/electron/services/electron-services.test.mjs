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

  it("registers the shared browser MCP without replacing user servers", () => {
    const existing = JSON.stringify({
      mcpServers: { custom: { type: "stdio", command: "custom-tool" } },
    });
    const first = hookInternals.mergeClaudeMcp(
      existing,
      "node",
      "K:\\AI\\MultiAgent\\app\\electron\\services\\browser-mcp-server.mjs"
    );
    const second = hookInternals.mergeClaudeMcp(
      first,
      "node",
      "K:\\AI\\MultiAgent\\app\\electron\\services\\browser-mcp-server.mjs"
    );
    const parsed = JSON.parse(first);
    expect(parsed.mcpServers.custom.command).toBe("custom-tool");
    expect(parsed.mcpServers["multiagent-browser"]).toMatchObject({
      type: "stdio",
      command: "node",
      args: [
        "-e",
        "import(require('node:url').pathToFileURL(process.env.MULTIAGENT_MCP_SCRIPT))",
      ],
    });
    expect(first).not.toContain("browser-mcp-server.mjs");
    expect(second).toBe(first);
    const codex = hookInternals.mergeCodex(
      'model = "gpt"\n',
      "C:\\helper\\notify.ps1",
      "K:\\AI\\MultiAgent\\app\\electron\\services\\browser-mcp-server.mjs"
    );
    expect(codex).toContain("[mcp_servers.multiagent_browser]");
    expect(codex).toContain(
      'args = ["-e", "import(require(\'node:url\').pathToFileURL(process.env.MULTIAGENT_MCP_SCRIPT))"]',
    );
    expect(codex).toContain(
      'env_vars = ["MULTIAGENT_AGENT_ID", "MULTIAGENT_PORT", "MULTIAGENT_TOKEN", "MULTIAGENT_MCP_SCRIPT"]',
    );
    expect(codex).not.toContain("browser-mcp-server.mjs");
    expect(hookInternals.mergeCodex(codex, "C:\\helper\\notify.ps1", "K:\\AI\\MultiAgent\\app\\electron\\services\\browser-mcp-server.mjs")).toBe(codex);
  });

  it("replaces stale managed Codex entries without removing user hooks", () => {
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

describe("browser MCP stdio bridge", () => {
  it("completes initialize using the same environment-based launcher as Codex", async () => {
    const scriptPath = path.resolve("electron", "services", "browser-mcp-server.mjs");
    const child = spawn(process.execPath, [
      "-e",
      "import(require('node:url').pathToFileURL(process.env.MULTIAGENT_MCP_SCRIPT))",
    ], {
      cwd: path.resolve("."),
      env: {
        ...process.env,
        MULTIAGENT_AGENT_ID: "agent-handshake",
        MULTIAGENT_PORT: "1",
        MULTIAGENT_TOKEN: "test-token",
        MULTIAGENT_MCP_SCRIPT: scriptPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const response = await new Promise((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => reject(new Error(`MCP initialize timeout: ${stderr}`)), 5_000);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
          const newline = stdout.indexOf("\n");
          if (newline < 0) return;
          clearTimeout(timeout);
          try { resolve(JSON.parse(stdout.slice(0, newline))); } catch (error) { reject(error); }
        });
        child.once("error", reject);
        child.once("exit", (code) => {
          if (!stdout.trim()) reject(new Error(`MCP exited before initialize (${code}): ${stderr}`));
        });
        child.stdin.write(`${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
        })}\n`);
      });
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: { serverInfo: { name: "multiagent-browser" } },
      });
    } finally {
      child.stdin.end();
      child.kill();
    }
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
    const browserCalls = [];
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
      browserProvider: async (request) => {
        browserCalls.push(request);
        return { ok: true, agentId: request.agentId, action: request.action, body: request.body };
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
      const browser = await fetch(
        `${baseUrl}/integration/v1/browser/agent-1/snapshot`,
        {
          method: "POST",
          headers: { ...authorization, "content-type": "application/json" },
          body: JSON.stringify({ tabId: "tab-1" }),
        }
      );
      expect(activate.status).toBe(202);
      expect(input.status).toBe(200);
      expect(browser.status).toBe(200);
      expect(activated).toEqual(["agent-1"]);
      expect(inputs).toEqual([{
        agentId: "agent-1",
        text: "이 작업을 진행해 주세요",
        submit: true,
        expectedSessionId: "session-1",
      }]);
      expect(browserCalls).toEqual([{
        agentId: "agent-1",
        action: "snapshot",
        body: { tabId: "tab-1" },
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
  it("keeps independent short-lived scan caches for Codex and Claude", async () => {
    const baseDir = temporaryDirectory();
    const codexRoot = path.join(baseDir, "codex");
    const claudeRoot = path.join(baseDir, "claude");
    await fsPromises.mkdir(codexRoot, { recursive: true });
    await fsPromises.mkdir(claudeRoot, { recursive: true });
    const codexFile = path.join(codexRoot, "11111111-1111-4111-8111-111111111111.jsonl");
    const claudeFile = path.join(claudeRoot, "22222222-2222-4222-8222-222222222222.jsonl");
    await fsPromises.writeFile(codexFile, "{}\n");
    await fsPromises.writeFile(claudeFile, "{}\n");
    const service = new SessionService(path.join(baseDir, "state"));
    service.transcriptRoots = (tool) => [tool === "codex" ? codexRoot : claudeRoot];

    await expect(service.scan("codex")).resolves.toHaveLength(1);
    await expect(service.scan("claude")).resolves.toHaveLength(1);
    await fsPromises.unlink(codexFile);

    // Scanning Claude must not evict Codex's still-valid cache entry.
    await expect(service.scan("codex")).resolves.toHaveLength(1);
  });

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

  it("groups requested current-session storage by project and session id", async () => {
    const baseDir = temporaryDirectory();
    const codexRoot = path.join(baseDir, "codex");
    const claudeRoot = path.join(baseDir, "claude");
    const folder = path.join(baseDir, "project");
    const otherFolder = path.join(baseDir, "other-project");
    const codexId = "11111111-1111-4111-8111-111111111111";
    const claudeId = "22222222-2222-4222-8222-222222222222";
    const staleId = "33333333-3333-4333-8333-333333333333";
    await fsPromises.mkdir(codexRoot, { recursive: true });
    await fsPromises.mkdir(path.join(claudeRoot, claudeId, "subagents"), { recursive: true });
    await fsPromises.mkdir(folder);
    await fsPromises.mkdir(otherFolder);

    const line = (id, cwd) =>
      `${JSON.stringify({ type: "session_meta", payload: { id, cwd } })}\n`;
    await fsPromises.writeFile(
      path.join(codexRoot, `${codexId}.jsonl`),
      `${line(codexId, folder)}codex-body`
    );
    await fsPromises.writeFile(
      path.join(codexRoot, `${staleId}.jsonl`),
      `${line(staleId, folder)}stale-body`
    );
    await fsPromises.writeFile(
      path.join(claudeRoot, `${claudeId}.jsonl`),
      `${line(claudeId, folder)}claude-body`
    );
    await fsPromises.writeFile(
      path.join(claudeRoot, claudeId, "subagents", "agent-child.jsonl"),
      `${line(claudeId, folder)}subagent-body`
    );
    await fsPromises.writeFile(
      path.join(claudeRoot, "other.jsonl"),
      `${line(claudeId, otherFolder)}other-body`
    );

    const service = new SessionService(path.join(baseDir, "state"));
    service.transcriptRoots = (tool) => [tool === "codex" ? codexRoot : claudeRoot];
    const results = await service.storageForSessions({
      folder,
      sessions: [
        { aiToolId: "codex", sessionId: codexId },
        { aiToolId: "claude", sessionId: claudeId },
      ],
      force: true,
    });

    expect(results).toHaveLength(2);
    expect(results.find((entry) => entry.aiToolId === "codex")).toMatchObject({
      sessionId: codexId,
      fileCount: 1,
    });
    const claude = results.find((entry) => entry.aiToolId === "claude");
    expect(claude).toMatchObject({ sessionId: claudeId, fileCount: 2 });
    expect(claude.bytes).toBeGreaterThan(0);
    expect(claude.primaryPath).toBe(
      path.resolve(fs.realpathSync.native(path.join(claudeRoot, `${claudeId}.jsonl`)))
    );
    expect(results.some((entry) => entry.sessionId === staleId)).toBe(false);

    const projectCatalog = await service.storageForSessions({
      folder,
      includeAllProjectSessions: true,
    });
    expect(projectCatalog.map((entry) => entry.sessionId).sort()).toEqual(
      [codexId, claudeId, staleId].sort()
    );
  });

  it("persists a metadata-only session catalog and reuses it without a tree scan", async () => {
    const baseDir = temporaryDirectory();
    const transcripts = path.join(baseDir, "codex");
    const storageDir = path.join(baseDir, "state");
    const folder = path.join(baseDir, "project");
    const sessionId = "55555555-5555-4555-8555-555555555555";
    await fsPromises.mkdir(transcripts, { recursive: true });
    await fsPromises.mkdir(folder);
    const transcriptPath = path.join(transcripts, `${sessionId}.jsonl`);
    await fsPromises.writeFile(
      transcriptPath,
      `${JSON.stringify({ type: "session_meta", payload: { id: sessionId, cwd: folder } })}\nSECRET_TRANSCRIPT_BODY`
    );

    const first = new SessionService(storageDir);
    first.transcriptRoots = () => [transcripts];
    await first.storageForSessions({
      folder,
      sessions: [{ aiToolId: "codex", sessionId }],
    });

    const catalogPath = path.join(storageDir, "session-storage-catalog.json");
    const catalogBody = await fsPromises.readFile(catalogPath, "utf8");
    const catalog = JSON.parse(catalogBody);
    expect(catalog).toMatchObject({ version: 1 });
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]).toMatchObject({
      aiToolId: "codex",
      sessionId,
      cwd: folder,
    });
    expect(catalogBody).not.toContain("SECRET_TRANSCRIPT_BODY");

    const restored = new SessionService(storageDir);
    restored.scan = async () => {
      throw new Error("catalog hit must not scan transcript roots");
    };
    await expect(restored.storageForSessions({
      folder,
      sessions: [{ aiToolId: "codex", sessionId }],
    })).resolves.toMatchObject([
      { aiToolId: "codex", sessionId, fileCount: 1 },
    ]);
  });
});
