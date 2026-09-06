import { describe, expect, it } from "vitest";
import type { Agent } from "../types";
import { applyAgentRuntimeStatus } from "./agentActivity";
import { isStandbySession, parseRememberedSessionIds, restoreStandbyEligibility } from "./sessionStandby";

const idle: Agent = {
  id: "session", projectId: "project", name: "Session", folder: "C:/project",
  aiToolId: "none", aiLabel: "Shell", dangerous: false, createdAt: 1,
  status: "idle", runtimeStatus: "idle", deferredStart: true,
};

describe("persistent standby intent", () => {
  it("migrates only previously running IDs, not every saved session", () => {
    const remembered = parseRememberedSessionIds('["session"]');
    expect(restoreStandbyEligibility(idle, remembered)).toBe(true);
    expect(restoreStandbyEligibility({ ...idle, id: "never-opened" }, remembered)).toBe(false);
    expect(isStandbySession({ ...idle, resumeEligible: false })).toBe(false);
  });

  it("retains standby across repeated restarts even when the live journal is empty", () => {
    let current = applyAgentRuntimeStatus(idle, "starting");
    for (let restart = 0; restart < 3; restart++) {
      const stored = JSON.parse(JSON.stringify({ id: current.id, resumeEligible: current.resumeEligible }));
      current = { ...idle, resumeEligible: restoreStandbyEligibility(stored, new Set()) };
      expect(isStandbySession(current)).toBe(true);
    }
  });

  it("explicit deactivation wins over a stale journal on every later restart", () => {
    const stopped = applyAgentRuntimeStatus({ ...idle, resumeEligible: true }, "idle");
    expect(restoreStandbyEligibility(stopped, new Set([idle.id]))).toBe(false);
    expect(restoreStandbyEligibility(stopped, new Set())).toBe(false);
    expect(applyAgentRuntimeStatus(stopped, "starting").resumeEligible).toBe(true);
  });

  it("tolerates missing and malformed legacy lists without enabling sessions", () => {
    for (const raw of [null, "invalid", "{}", '[null, 5]']) {
      expect(parseRememberedSessionIds(raw).size).toBe(0);
    }
  });
});
