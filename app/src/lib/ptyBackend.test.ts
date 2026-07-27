import { describe, expect, it } from "vitest";
import { windowsPtyBackendForAgent } from "./ptyBackend";

describe("renderer Windows PTY backend selection", () => {
  it("uses WinPTY for local Codex", () => {
    expect(windowsPtyBackendForAgent("codex")).toBe("winpty");
  });

  it("uses ConPTY for SSH Codex", () => {
    expect(windowsPtyBackendForAgent("codex", "ssh-host")).toBe("conpty");
  });

  it.each(["claude", "none", "shell"])(
    "uses ConPTY for local %s",
    (aiToolId) => {
      expect(windowsPtyBackendForAgent(aiToolId)).toBe("conpty");
    },
  );
});
