import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOWS_CODEX_PTY_BACKEND,
  parseWindowsPtyBackend,
  windowsPtyBackendForAgent,
} from "./ptyBackend";

describe("renderer Windows PTY backend selection", () => {
  it("uses the selected backend for local Codex", () => {
    expect(windowsPtyBackendForAgent("codex", null, "winpty")).toBe("winpty");
    expect(windowsPtyBackendForAgent("codex", null, "conpty")).toBe("conpty");
  });

  it("uses ConPTY for SSH Codex", () => {
    expect(windowsPtyBackendForAgent("codex", "ssh-host", "winpty")).toBe(
      "conpty",
    );
  });

  it.each(["claude", "none", "shell"])(
    "uses ConPTY for local %s",
    (aiToolId) => {
      expect(windowsPtyBackendForAgent(aiToolId)).toBe("conpty");
    },
  );

  it("falls back to WinPTY for missing or invalid stored values", () => {
    expect(parseWindowsPtyBackend(null)).toBe(
      DEFAULT_WINDOWS_CODEX_PTY_BACKEND,
    );
    expect(parseWindowsPtyBackend("invalid")).toBe(
      DEFAULT_WINDOWS_CODEX_PTY_BACKEND,
    );
  });
});
