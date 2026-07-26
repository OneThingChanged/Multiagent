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

  it("rejects commands and emitted events outside the contract", () => {
    expect(() => contract.assertInvokeRequest("shell_exec", {})).toThrow("Blocked");
    expect(() => contract.assertAllowed(
      contract.emittedSet,
      "pty:data",
      "event emission"
    )).toThrow("Blocked");
  });
});
