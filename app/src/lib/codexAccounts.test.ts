import { describe, it, expect } from "vitest";
import { switchCodexAccount } from "./codexAccounts";
import type { Agent } from "../types";

const agent: Agent = { id: "a", projectId: "p", name: "A", folder: "project", aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 0, lastSessionId: "default-conversation" };

describe("session account switching", () => {
  it("starts fresh once and restores each account's own conversation on return", () => {
    const work = switchCodexAccount(agent, "work");
    expect(work.lastSessionId).toBeUndefined();
    expect(work.deferredStart).toBe(true);
    expect(work.resumeEligible).toBe(false);
    const original = switchCodexAccount({ ...work, lastSessionId: "work-conversation" }, "default");
    expect(original.lastSessionId).toBe("default-conversation");
    expect(switchCodexAccount(original, "work").lastSessionId).toBe("work-conversation");
    expect(agent.codexAccountSessions).toBeUndefined();
  });
  it("does not change state when selecting the current account", () => {
    expect(switchCodexAccount(agent, "default")).toBe(agent);
  });
});
