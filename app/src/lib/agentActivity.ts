import type {
  Agent,
  AgentActivity,
  AgentRuntimeStatus,
  AgentStatus,
  AgentWorkStatus,
} from "../types";

export const AGENT_ACTIVITY_STALE_AFTER_MS = 30 * 60 * 1000;

export type AgentHookEvent = {
  id: string;
  event: string;
  session_id?: string | null;
  hook_event_name?: string | null;
  received_at?: number | null;
  prompt?: string | null;
  tool_name?: string | null;
  tool_input?: string | null;
  interactive_question?: string | null;
  assistant_message?: string | null;
};

function clean(value: string | null | undefined, maxLength = 2_000) {
  const result = value?.trim();
  return result ? result.slice(0, maxLength) : undefined;
}

export function runtimeStatusOf(
  agent: Pick<Agent, "status" | "runtimeStatus">
): AgentRuntimeStatus {
  if (agent.runtimeStatus) return agent.runtimeStatus;
  if (
    agent.status === "idle" ||
    agent.status === "starting" ||
    agent.status === "recovering" ||
    agent.status === "running" ||
    agent.status === "exited" ||
    agent.status === "unreachable"
  ) {
    return agent.status;
  }
  return "running";
}

export function isAgentRuntimeActive(
  agent: Pick<Agent, "status" | "runtimeStatus">
): boolean {
  const status = runtimeStatusOf(agent);
  return (
    status === "running" ||
    status === "starting" ||
    status === "recovering"
  );
}

export function deriveAgentStatus(
  runtimeStatus: AgentRuntimeStatus,
  activity?: AgentActivity,
  now = Date.now()
): AgentStatus {
  if (runtimeStatus !== "running") return runtimeStatus;
  if (!activity || now - activity.receivedAt > AGENT_ACTIVITY_STALE_AFTER_MS) {
    return "running";
  }
  if (
    activity.workStatus === "working" ||
    activity.workStatus === "waiting" ||
    activity.workStatus === "blocked"
  ) {
    return activity.workStatus;
  }
  return "running";
}

export function applyAgentRuntimeStatus(
  agent: Agent,
  runtimeStatus: AgentRuntimeStatus,
  now = Date.now()
): Agent {
  const activity =
    runtimeStatus === "idle" ||
    runtimeStatus === "starting" ||
    runtimeStatus === "recovering"
      ? undefined
      : agent.activity;
  return {
    ...agent,
    runtimeStatus,
    deferredStart: undefined,
    activity,
    status: deriveAgentStatus(runtimeStatus, activity, now),
  };
}

function workStatusForHook(event: AgentHookEvent): AgentWorkStatus | null {
  const eventName = event.event.trim().toLowerCase();
  const hookName = event.hook_event_name?.trim().toLowerCase();
  const toolName = event.tool_name?.trim().toLowerCase();
  if (eventName === "session-start") return null;
  if (eventName === "done" || hookName === "stop") return "done";
  if (
    eventName === "blocked" ||
    hookName === "stopfailure"
  ) {
    return "blocked";
  }
  if (
    eventName === "waiting" ||
    hookName === "permissionrequest" ||
    toolName === "askuserquestion"
  ) {
    return "waiting";
  }
  if (
    eventName === "working" ||
    eventName === "tool-start" ||
    eventName === "tool-end" ||
    hookName === "posttoolusefailure"
  ) {
    return "working";
  }
  return null;
}

export function isAgentCancellationHookEvent(event: AgentHookEvent): boolean {
  const eventName = event.event.trim().toLowerCase();
  const hookName = event.hook_event_name?.trim().toLowerCase();
  return (
    ["cancelled", "canceled", "interrupted", "aborted"].includes(eventName) ||
    ["remotecancel", "usercancel", "interrupt"].includes(hookName || "")
  );
}

export function applyAgentHookEvent(
  agent: Agent,
  event: AgentHookEvent,
  now = Date.now()
): Agent {
  const currentRuntimeStatus = runtimeStatusOf(agent);
  // A hook can only be emitted by a live CLI process. Promote startup/idle
  // races to running, while keeping a confirmed PTY exit authoritative.
  const runtimeStatus =
    currentRuntimeStatus === "idle" ||
    currentRuntimeStatus === "starting" ||
    currentRuntimeStatus === "recovering"
      ? "running"
      : currentRuntimeStatus;
  const workStatus = workStatusForHook(event);
  const previous = agent.activity;
  const receivedAt = event.received_at || now;
  const providerSessionId = clean(event.session_id, 200);

  let activity = previous;
  if (isAgentCancellationHookEvent(event)) {
    // Cancellation ends the current turn, not the PTY process. Clearing the
    // work activity makes the live session ready for the next prompt without
    // misreporting a successful completion.
    activity = undefined;
  } else if (workStatus) {
    const prompt = clean(event.prompt);
    const toolName = clean(event.tool_name, 200);
    const toolInput = clean(event.tool_input, 4_000);
    const question = clean(
      event.interactive_question ||
        (toolName?.toLowerCase() === "askuserquestion" ? toolInput : undefined)
    );
    activity = {
      workStatus,
      source: "hook",
      receivedAt,
      stateStartedAt:
        previous?.workStatus === workStatus ? previous.stateStartedAt : receivedAt,
      providerSessionId: providerSessionId || previous?.providerSessionId,
      hookEventName: clean(event.hook_event_name, 200) || event.event,
      lastPrompt: prompt || previous?.lastPrompt,
      toolName: toolName || previous?.toolName,
      toolInput: toolInput || previous?.toolInput,
      interactiveQuestion: question || previous?.interactiveQuestion,
      lastAssistantMessage:
        clean(event.assistant_message, 4_000) || previous?.lastAssistantMessage,
    };
  } else if (providerSessionId || event.hook_event_name) {
    activity = {
      ...previous,
      workStatus: previous?.workStatus ?? "unknown",
      source: "hook",
      receivedAt,
      stateStartedAt: previous?.stateStartedAt ?? receivedAt,
      providerSessionId: providerSessionId || previous?.providerSessionId,
      hookEventName: clean(event.hook_event_name, 200) || event.event,
    };
  }

  return {
    ...agent,
    lastSessionId: providerSessionId || agent.lastSessionId,
    runtimeStatus,
    activity,
    status: deriveAgentStatus(runtimeStatus, activity, now),
  };
}

export function isAgentActivelyWorking(
  agent: Pick<Agent, "status" | "activity">,
  now = Date.now()
) {
  return (
    agent.status === "working" ||
    agent.status === "waiting" ||
    agent.status === "blocked" ||
    (!!agent.activity &&
      now - agent.activity.receivedAt <= AGENT_ACTIVITY_STALE_AFTER_MS &&
      (agent.activity.workStatus === "working" ||
        agent.activity.workStatus === "waiting" ||
        agent.activity.workStatus === "blocked"))
  );
}
