import { describe, expect, it } from "vitest";
import type { Agent } from "../types";
import {
  AGENT_ACTIVITY_STALE_AFTER_MS,
  applyAgentHookEvent,
  applyAgentRuntimeStatus,
  deriveAgentStatus,
  isAgentRuntimeActive,
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

  it("keeps a restored process in recovery until a hook proves the CLI is ready", () => {
    const working = applyAgentHookEvent(
      agent(),
      { id: "agent-1", event: "working" },
      100
    );
    const recovering = applyAgentRuntimeStatus(working, "recovering", 200);
    const ready = applyAgentHookEvent(
      recovering,
      {
        id: "agent-1",
        event: "session-start",
        hook_event_name: "SessionStart",
        session_id: "session-1",
      },
      300
    );

    expect(recovering).toMatchObject({
      status: "recovering",
      runtimeStatus: "recovering",
      activity: undefined,
    });
    expect(ready).toMatchObject({
      status: "running",
      runtimeStatus: "running",
      lastSessionId: "session-1",
    });
  });

  it("returns a cancelled live turn to the running idle state", () => {
    const working = applyAgentHookEvent(
      agent(),
      { id: "agent-1", event: "working", session_id: "session-1" },
      100
    );
    const cancelled = applyAgentHookEvent(
      working,
      {
        id: "agent-1",
        event: "cancelled",
        hook_event_name: "RemoteCancel",
        session_id: "session-1",
      },
      200
    );

    expect(cancelled).toMatchObject({
      status: "running",
      runtimeStatus: "running",
      lastSessionId: "session-1",
      activity: undefined,
    });
  });

  it("uses one runtime-active rule for derived work states", () => {
    expect(isAgentRuntimeActive(agent("running"))).toBe(true);
    expect(isAgentRuntimeActive({ ...agent("working"), status: "working" }))
      .toBe(true);
    expect(isAgentRuntimeActive({ ...agent("idle"), runtimeStatus: "starting" }))
      .toBe(true);
    expect(isAgentRuntimeActive({ ...agent("idle"), runtimeStatus: "recovering" }))
      .toBe(true);
    expect(isAgentRuntimeActive(agent("idle"))).toBe(false);
    expect(
      isAgentRuntimeActive({
        ...agent("exited"),
        status: "exited",
        runtimeStatus: "exited",
      })
    ).toBe(false);
  });
});
