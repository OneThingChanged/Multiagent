import { describe, expect, it } from "vitest";
import {
  buildMiraControlSnapshot,
  deriveMiraControlState,
  MIRACONTROL_HOOK_STALE_AFTER_MS,
  prepareMiraControlInput,
} from "./miracontrol-integration.mjs";

describe("MiraControl integration state", () => {
  it("maps live hook states into the four-state StreamDeck contract", () => {
    const now = 1_800_000_000_000;
    expect(deriveMiraControlState({ active: false, status: "working" }, now))
      .toEqual({ state: "OFFLINE", reason: "inactive" });
    expect(deriveMiraControlState({ active: true, status: "working" }, now))
      .toEqual({ state: "WORK", reason: "working" });
    expect(deriveMiraControlState({ active: true, status: "blocked" }, now))
      .toEqual({ state: "WAIT", reason: "blocked" });
    expect(deriveMiraControlState({
      active: true,
      status: "running",
      hook: { event: "done", received_at: now - 10 },
    }, now)).toEqual({ state: "DONE", reason: "completed" });
    expect(deriveMiraControlState({
      active: true,
      status: "running",
      hook: { event: "session-start", received_at: now - 10 },
    }, now)).toEqual({ state: "WAIT", reason: "ready" });
  });

  it("does not keep a stale tool hook in WORK forever", () => {
    const now = 1_800_000_000_000;
    expect(deriveMiraControlState({
      active: true,
      status: "running",
      hook: {
        event: "tool-start",
        received_at: now - MIRACONTROL_HOOK_STALE_AFTER_MS - 1,
      },
    }, now)).toEqual({ state: "WAIT", reason: "ready" });
    expect(deriveMiraControlState({
      active: true,
      status: "running",
      hook: {
        event: "done",
        received_at: now - MIRACONTROL_HOOK_STALE_AFTER_MS - 1,
      },
    }, now)).toEqual({ state: "DONE", reason: "completed" });
  });

  it("builds a compact Codex/Claude-only snapshot with stable identities", () => {
    const now = 1_800_000_000_000;
    const hooks = new Map([
      ["codex-1", { event: "done", session_id: "hook-session", received_at: now }],
      ["claude-1", { event: "waiting", received_at: now }],
    ]);
    const snapshot = buildMiraControlSnapshot({
      projects: [{ id: "project-1", name: "MultiAgent", folder: "secret" }],
      agents: [
        {
          id: "codex-1",
          projectId: "project-1",
          name: "Backend",
          aiToolId: "codex",
          status: "running",
          lastSessionId: "stored-session",
          folder: "secret",
        },
        {
          id: "claude-1",
          projectId: "project-1",
          name: "Review",
          aiToolId: "claude",
          status: "waiting",
        },
        { id: "shell-1", aiToolId: "shell", status: "running" },
      ],
      isActive: (id) => id === "codex-1",
      hookFor: (id) => hooks.get(id),
      sessionIdFor: (id) => id === "codex-1" ? "live-session" : null,
      appVersion: "0.5.83",
      variant: "standard",
      pid: 1234,
      now,
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      generatedAt: now,
      app: { status: "ONLINE", version: "0.5.83", variant: "standard", pid: 1234 },
      sessions: [
        {
          agentId: "codex-1",
          providerSessionId: "live-session",
          sessionName: "Backend",
          projectId: "project-1",
          projectName: "MultiAgent",
          tool: "codex",
          state: "DONE",
          active: true,
        },
        {
          agentId: "claude-1",
          providerSessionId: null,
          state: "OFFLINE",
          active: false,
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(snapshot.sessions).toHaveLength(2);
  });

  it("guards input against inactive, changed, and already-working sessions", () => {
    const base = {
      active: true,
      state: "DONE",
      providerSessionId: "session-current",
      expectedSessionId: "session-current",
      text: "다음 작업을 진행해 주세요",
    };
    expect(prepareMiraControlInput(base)).toEqual({
      ok: true,
      data: "다음 작업을 진행해 주세요\r",
      providerSessionId: "session-current",
    });
    expect(prepareMiraControlInput({ ...base, active: false }))
      .toMatchObject({ ok: false, httpStatus: 409, error: "session is not active" });
    expect(prepareMiraControlInput({ ...base, expectedSessionId: "session-old" }))
      .toMatchObject({ ok: false, httpStatus: 409, code: "session_changed" });
    expect(prepareMiraControlInput({ ...base, expectedSessionId: "" }))
      .toMatchObject({ ok: false, httpStatus: 428 });
    expect(prepareMiraControlInput({ ...base, state: "WORK" }))
      .toMatchObject({ ok: false, httpStatus: 409, code: "session_working" });
    expect(prepareMiraControlInput({ ...base, text: "한".repeat(3000) }))
      .toMatchObject({ ok: false, httpStatus: 400, error: "input is too large" });
  });
});
