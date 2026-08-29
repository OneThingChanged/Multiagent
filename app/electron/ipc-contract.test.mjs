import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const contract = require("./ipc-contract.cjs");

describe("Electron IPC contract", () => {
  it("shares the terminal command allowlist with preload and main", () => {
    expect(contract.INVOKE_COMMANDS).toContain("attach_terminal");
    expect(contract.INVOKE_COMMANDS).toContain("detach_terminal");
    expect(contract.INVOKE_COMMANDS).toContain("terminal_session_action");
    expect(contract.INVOKE_COMMANDS).toContain("get_agent_window_usage");
    expect(contract.INVOKE_COMMANDS).toContain("claim_agent_for_window");
    expect(contract.INVOKE_COMMANDS).toContain("list_git_submodules");
    expect(contract.DELIVERED_EVENTS).toContain("remote:create-session");
    expect(contract.DELIVERED_EVENTS).toContain("remote:rename-session");
  });

  it("validates submodule discovery roots", () => {
    expect(
      contract.assertInvokeRequest("list_git_submodules", {
        folder: "K:\\AI\\MultiAgent",
      })
    ).toMatchObject({ folder: "K:\\AI\\MultiAgent" });
    expect(() =>
      contract.assertInvokeRequest("list_git_submodules", { folder: "" })
    ).toThrow("folder");
  });

  it("limits session storage access to explicit current session ids", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    expect(contract.assertInvokeRequest("session_storage_list", {
      folder: "K:\\AI\\MultiAgent",
      sessions: [{ aiToolId: "codex", sessionId }],
    })).toMatchObject({ sessions: [{ aiToolId: "codex", sessionId }] });
    expect(contract.assertInvokeRequest("session_storage_list", {
      folder: "K:\\AI\\MultiAgent",
      includeAllProjectSessions: true,
    })).toMatchObject({ includeAllProjectSessions: true });
    expect(contract.assertInvokeRequest("session_storage_delete", {
      folder: "K:\\AI\\MultiAgent",
      aiToolId: "claude",
      sessionId,
      agentId: "agent-a",
    })).toMatchObject({ aiToolId: "claude", sessionId });
    expect(() => contract.assertInvokeRequest("session_storage_list", {
      folder: "K:\\AI\\MultiAgent",
      sessions: [],
    })).toThrow("queries");
    expect(() => contract.assertInvokeRequest("session_storage_delete", {
      folder: "K:\\AI\\MultiAgent",
      aiToolId: "codex",
      sessionId: "../../other-project",
    })).toThrow("id");
  });

  it("validates terminal cursors, actions and write bounds", () => {
    expect(contract.assertInvokeRequest("attach_terminal", {
      id: "agent", afterSequence: 12,
    })).toMatchObject({ afterSequence: 12 });
    expect(() => contract.assertInvokeRequest("attach_terminal", {
      id: "agent", afterSequence: -1,
    })).toThrow("sequence");
    expect(() => contract.assertInvokeRequest("terminal_session_action", {
      id: "agent", action: "destroy-everything",
    })).toThrow("action");
    expect(() => contract.assertInvokeRequest("write_pty", {
      id: "agent", data: "x".repeat(1024 * 1024 + 1),
    })).toThrow("1 MiB");
    expect(contract.assertInvokeRequest("claim_agent_for_window", {
      agentId: "agent",
    })).toMatchObject({ agentId: "agent" });
    expect(() => contract.assertInvokeRequest("claim_agent_for_window", {
      agentId: "",
    })).toThrow("agent id");
  });

  it("validates embedded document browser bounds", () => {
    expect(contract.assertInvokeRequest("document_browser_bounds", {
      browserId: "browser",
      x: 0,
      y: 36,
      width: 640,
      height: 480,
    })).toMatchObject({ width: 640, height: 480 });
    expect(() => contract.assertInvokeRequest("document_browser_bounds", {
      browserId: "browser",
      x: -1,
      y: 0,
      width: 640,
      height: 480,
    })).toThrow("non-negative");
    expect(() => contract.assertInvokeRequest("document_browser_bounds", {
      browserId: "browser",
      x: 0,
      y: 0,
      width: 0,
      height: 480,
    })).toThrow("positive");
  });

  it("validates embedded document browser visibility", () => {
    expect(contract.assertInvokeRequest("document_browser_visibility", {
      browserId: "browser",
      visible: false,
    })).toMatchObject({ browserId: "browser", visible: false });
    expect(() => contract.assertInvokeRequest("document_browser_visibility", {
      browserId: "browser",
      visible: "false",
    })).toThrow("visibility flag");
  });

  it("supports document previews and standalone HTTP(S) browser tabs", () => {
    expect(contract.assertInvokeRequest("document_browser_open", {
      folder: "K:\\AI\\MultiAgent",
      relativePath: "docs/index.html",
    })).toMatchObject({ relativePath: "docs/index.html" });
    expect(contract.assertInvokeRequest("document_browser_open", {
      folder: "",
      relativePath: "",
      initialUrl: "https://www.google.com/",
    })).toMatchObject({ initialUrl: "https://www.google.com/" });
    expect(() => contract.assertInvokeRequest("document_browser_open", {
      folder: "",
      relativePath: "docs/index.html",
      initialUrl: "https://www.google.com/",
    })).toThrow("provided together");
    expect(() => contract.assertInvokeRequest("document_browser_open", {
      folder: "",
      relativePath: "",
      initialUrl: "file:///C:/secret.txt",
    })).toThrow("http or https");
  });

  it("allows only HTTP(S) navigation in the embedded browser", () => {
    expect(contract.assertInvokeRequest("document_browser_navigate", {
      browserId: "browser",
      url: "https://example.com/docs?q=multiagent",
    })).toMatchObject({ url: "https://example.com/docs?q=multiagent" });
    expect(() => contract.assertInvokeRequest("document_browser_navigate", {
      browserId: "browser",
      url: "file:///C:/secret.txt",
    })).toThrow("http or https");
    expect(() => contract.assertInvokeRequest("document_browser_navigate", {
      browserId: "browser",
      url: "not a url",
    })).toThrow("valid HTTP(S)");
  });

  it("validates browser element inspection mode and delivery intent", () => {
    expect(contract.assertInvokeRequest("document_browser_inspect", {
      browserId: "browser",
      enabled: true,
      sendToSession: true,
    })).toMatchObject({ enabled: true, sendToSession: true });
    expect(() => contract.assertInvokeRequest("document_browser_inspect", {
      browserId: "browser",
      enabled: "yes",
    })).toThrow("inspection flag");
    expect(() => contract.assertInvokeRequest("document_browser_inspect", {
      browserId: "browser",
      enabled: true,
      sendToSession: "yes",
    })).toThrow("delivery flag");
  });

  it("rejects commands and emitted events outside the contract", () => {
    expect(() => contract.assertInvokeRequest("shell_exec", {})).toThrow("Blocked");
    expect(() => contract.assertAllowed(
      contract.emittedSet,
      "pty:data",
      "event emission"
    )).toThrow("Blocked");
  });
});
