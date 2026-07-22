import { describe, expect, it } from "vitest";
import type { Agent } from "../types";
import {
  AGENT_ACTIVITY_STALE_AFTER_MS,
  applyAgentHookEvent,
  applyAgentRuntimeStatus,
  deriveAgentStatus,
} from "./agentActivity";

function agent(status: Agent["status"] = "running"): Agent {
  return {
    id: "agent-1",
    projectId: "project-1",
    name: "Session",
    folder: "C:\\project",
    aiToolId: "codex",
    aiLabel: "Codex",
    dangerous: false,
    status,
    runtimeStatus: status === "idle" ? "idle" : "running",
    createdAt: 1,
  };
}

describe("agent activity state v2", () => {
  it("keeps process state separate from work completion", () => {
    const working = applyAgentHookEvent(
      agent(),
      { id: "agent-1", event: "working", prompt: "P0를 진행해줘" },
      100
    );
    const done = applyAgentHookEvent(
      working,
      { id: "agent-1", event: "done", assistant_message: "완료했습니다" },
      200
    );
    expect(working.status).toBe("working");
    expect(done).toMatchObject({
      status: "running",
      runtimeStatus: "running",
      activity: {
        workStatus: "done",
        lastPrompt: "P0를 진행해줘",
        lastAssistantMessage: "완료했습니다",
      },
    });
  });

  it("uses a live hook to resolve the startup race", () => {
    const result = applyAgentHookEvent(
      { ...agent("idle"), runtimeStatus: "starting", status: "starting" },
      { id: "agent-1", event: "working" },
      100
    );
    expect(result).toMatchObject({ runtimeStatus: "running", status: "working" });
  });

  it("maps AskUserQuestion and failures to waiting and blocked", () => {
    const waiting = applyAgentHookEvent(
      agent(),
      {
        id: "agent-1",
        event: "tool-start",
        hook_event_name: "PreToolUse",
        tool_name: "AskUserQuestion",
        tool_input: "어느 옵션으로 할까요?",
      },
      100
    );
    const blocked = applyAgentHookEvent(
      waiting,
      { id: "agent-1", event: "blocked", hook_event_name: "StopFailure" },
      200
    );
    expect(waiting.status).toBe("waiting");
    expect(waiting.activity?.interactiveQuestion).toBe("어느 옵션으로 할까요?");
    expect(blocked.status).toBe("blocked");
  });

  it("keeps working after a recoverable Claude tool failure", () => {
    const result = applyAgentHookEvent(
      agent(),
      {
        id: "agent-1",
        event: "working",
        hook_event_name: "PostToolUseFailure",
        tool_name: "Bash",
      },
      100
    );
    expect(result.status).toBe("working");
    expect(result.activity?.hookEventName).toBe("PostToolUseFailure");
  });

  it("does not show a stale working hook forever", () => {
    expect(
      deriveAgentStatus(
        "running",
        {
          workStatus: "working",
          source: "hook",
          receivedAt: 100,
          stateStartedAt: 100,
        },
        100 + AGENT_ACTIVITY_STALE_AFTER_MS + 1
      )
    ).toBe("running");
  });

  it("clears stale activity when a process is restarted", () => {
    const working = applyAgentHookEvent(agent(), { id: "agent-1", event: "working" }, 100);
    expect(applyAgentRuntimeStatus(working, "starting", 200)).toMatchObject({
      status: "starting",
      runtimeStatus: "starting",
      activity: undefined,
    });
  });
});
