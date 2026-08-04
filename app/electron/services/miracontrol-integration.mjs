export const MIRACONTROL_API_VERSION = 1;
export const MIRACONTROL_HOOK_STALE_AFTER_MS = 30 * 60 * 1000;

const SUPPORTED_TOOLS = new Set(["codex", "claude"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hookTimestamp(hook) {
  const receivedAt = Number(hook?.received_at);
  if (Number.isFinite(receivedAt) && receivedAt > 0) return receivedAt;
  const lastTs = Number(hook?.lastTs);
  return Number.isFinite(lastTs) && lastTs > 0 ? lastTs : null;
}

function lower(value) {
  return text(value).toLowerCase();
}

export function deriveMiraControlState(
  { active, status, hook },
  now = Date.now()
) {
  if (!active) return { state: "OFFLINE", reason: "inactive" };

  const runtimeStatus = lower(status);
  if (runtimeStatus === "recovering" || runtimeStatus === "starting") {
    return { state: "WAIT", reason: "initializing" };
  }
  if (runtimeStatus === "working") {
    return { state: "WORK", reason: "working" };
  }
  if (runtimeStatus === "blocked") {
    return { state: "WAIT", reason: "blocked" };
  }
  if (runtimeStatus === "waiting") {
    return { state: "WAIT", reason: "input" };
  }

  const timestamp = hookTimestamp(hook);
  const event = lower(hook?.event);
  const hookName = lower(hook?.hook_event_name);
  const toolName = lower(hook?.tool_name);
  // Completion remains meaningful until the next hook event, just like the
  // desktop's completed state. Only active work/wait hooks expire defensively.
  if (event === "done" || hookName === "stop") {
    return { state: "DONE", reason: "completed" };
  }
  const hookIsFresh =
    timestamp !== null && now - timestamp <= MIRACONTROL_HOOK_STALE_AFTER_MS;
  if (hookIsFresh) {
    if (
      event === "blocked" ||
      hookName === "stopfailure"
    ) {
      return { state: "WAIT", reason: "blocked" };
    }
    if (
      event === "waiting" ||
      hookName === "permissionrequest" ||
      toolName === "askuserquestion"
    ) {
      return { state: "WAIT", reason: "input" };
    }
    if (
      event === "working" ||
      event === "tool-start" ||
      event === "tool-end" ||
      hookName === "posttoolusefailure"
    ) {
      return { state: "WORK", reason: event || hookName || "working" };
    }
  }

  // A live CLI with no active/fresh hook is ready for the next instruction.
  // MiraControl intentionally keeps its four-state contract and distinguishes
  // this from a permission prompt through the reason field.
  return { state: "WAIT", reason: "ready" };
}

export function buildMiraControlSnapshot({
  projects = [],
  agents = [],
  isActive = () => false,
  hookFor = () => null,
  sessionIdFor = () => null,
  appVersion = "",
  variant = "standard",
  pid = process.pid,
  now = Date.now(),
} = {}) {
  const projectNames = new Map(
    (Array.isArray(projects) ? projects : []).map((project) => [
      text(project?.id),
      text(project?.name),
    ])
  );
  const sessions = [];

  for (const agent of Array.isArray(agents) ? agents : []) {
    const agentId = text(agent?.id);
    const tool = lower(agent?.aiToolId || agent?.tool);
    if (!agentId || !SUPPORTED_TOOLS.has(tool)) continue;
    const hook = hookFor(agentId) ?? null;
    const active = Boolean(isActive(agentId));
    const state = deriveMiraControlState(
      { active, status: agent?.status, hook },
      now
    );
    const providerSessionId =
      text(sessionIdFor(agentId)) ||
      text(hook?.session_id) ||
      text(agent?.lastSessionId) ||
      null;
    sessions.push({
      agentId,
      providerSessionId,
      sessionName: text(agent?.name) || agentId,
      projectId: text(agent?.projectId) || null,
      projectName: projectNames.get(text(agent?.projectId)) || "",
      tool,
      state: state.state,
      reason: state.reason,
      active,
      updatedAt: hookTimestamp(hook),
    });
  }

  return {
    schemaVersion: MIRACONTROL_API_VERSION,
    generatedAt: now,
    app: {
      status: "ONLINE",
      version: text(appVersion),
      variant: text(variant) || "standard",
      pid,
    },
    sessions,
  };
}

export function prepareMiraControlInput({
  active,
  state,
  reason,
  providerSessionId,
  expectedSessionId,
  text: input,
  submit = true,
}) {
  if (!active) {
    return { ok: false, httpStatus: 409, error: "session is not active" };
  }
  if (reason === "initializing") {
    return {
      ok: false,
      httpStatus: 409,
      error: "session is still initializing",
      code: "session_initializing",
    };
  }
  const currentSessionId = text(providerSessionId);
  if (!currentSessionId) {
    return {
      ok: false,
      httpStatus: 409,
      error: "provider session identity is unavailable",
    };
  }
  const expected = text(expectedSessionId);
  if (!expected) {
    return {
      ok: false,
      httpStatus: 428,
      error: "expectedSessionId is required",
    };
  }
  if (expected !== currentSessionId) {
    return {
      ok: false,
      httpStatus: 409,
      error: "provider session changed",
      code: "session_changed",
    };
  }
  if (state === "WORK") {
    return {
      ok: false,
      httpStatus: 409,
      error: "session is already working",
      code: "session_working",
    };
  }
  const value = typeof input === "string" ? input : "";
  if (!value.trim() || value.includes("\0")) {
    return { ok: false, httpStatus: 400, error: "invalid input" };
  }
  const normalized = value.replace(/\r\n?/g, "\n");
  const data = `${normalized}${submit === false ? "" : "\r"}`;
  if (Buffer.byteLength(data, "utf8") > 8 * 1024) {
    return { ok: false, httpStatus: 400, error: "input is too large" };
  }
  return { ok: true, data, providerSessionId: currentSessionId };
}
