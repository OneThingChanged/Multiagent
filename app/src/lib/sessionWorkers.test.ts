import { describe, expect, it } from "vitest";
import {
  addSessionWorkerArgs,
  availableSessionWorkerOptions,
  normalizeSessionWorkerSettings,
  sessionWorkerDeveloperInstructions,
  updateSessionWorkerSetting,
} from "./sessionWorkers";

describe("session worker availability", () => {
  it("only exposes providers enabled in Settings", () => {
    expect(availableSessionWorkerOptions([]).map((item) => item.id)).toEqual([
      "codex-luna-max",
      "claude-opus",
    ]);
    expect(
      availableSessionWorkerOptions(["claude"]).map((item) => item.id)
    ).toEqual(["codex-luna-max"]);
    expect(
      availableSessionWorkerOptions(["codex"]).map((item) => item.id)
    ).toEqual(["claude-opus"]);
    expect(availableSessionWorkerOptions(["codex", "claude"])).toEqual([]);
  });

  it("normalizes legacy or invalid stored values", () => {
    expect(normalizeSessionWorkerSettings(undefined)).toBeUndefined();
    expect(normalizeSessionWorkerSettings({ documents: "unknown" })).toBeUndefined();
    expect(
      normalizeSessionWorkerSettings({
        documents: "codex-luna-max",
        html: "claude-opus",
      })
    ).toEqual({ documents: "codex-luna-max", html: "claude-opus" });
  });

  it("removes an empty settings object", () => {
    const settings = updateSessionWorkerSetting(
      { documents: "codex-luna-max" },
      "documents",
      undefined
    );
    expect(settings).toBeUndefined();
  });
});

describe("Codex session worker arguments", () => {
  it("does not modify non-Codex or unconfigured sessions", () => {
    expect(addSessionWorkerArgs("claude", "claude", {
      documents: "claude-opus",
    })).toBe("claude");
    expect(addSessionWorkerArgs("codex", "codex", undefined)).toBe("codex");
  });

  it("adds Luna max defaults and per-session routing instructions", () => {
    const command = addSessionWorkerArgs("codex", "codex --no-alt-screen", {
      documents: "codex-luna-max",
      html: "claude-opus",
    });

    expect(command).toContain("-c 'agents.enabled=true'");
    expect(command).toContain(
      "-c 'agents.max_concurrent_threads_per_session=2'"
    );
    expect(command).toContain(
      "-c 'agents.default_subagent_model=\"gpt-5.6-luna\"'"
    );
    expect(command).toContain(
      "-c 'agents.default_subagent_reasoning_effort=\"max\"'"
    );
    expect(command).toContain("claude -p --model opus --effort max");
    expect(command).not.toContain("dangerously-skip-permissions");
  });

  it("keeps apostrophes out of single-quoted shell config arguments", () => {
    const instructions = sessionWorkerDeveloperInstructions({
      documents: "claude-opus",
    });
    expect(instructions).not.toContain("'");
  });
});
