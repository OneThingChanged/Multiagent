import { describe, expect, it } from "vitest";
import {
  resolvePtyBackend,
  TERMINAL_FILTER_KIND,
} from "./pty-backend.mjs";

describe("PTY backend selection", () => {
  it("uses WinPTY with pass-through output for local Windows Codex", () => {
    expect(
      resolvePtyBackend({
        platform: "win32",
        aiToolId: "codex",
        hasSsh: false,
      }),
    ).toEqual({
      useWinptyForCodex: true,
      useConpty: false,
      filterKind: TERMINAL_FILTER_KIND.PASS_THROUGH,
    });
  });

  it("keeps ConPTY and the Codex filter for SSH Codex", () => {
    expect(
      resolvePtyBackend({
        platform: "win32",
        aiToolId: "codex",
        hasSsh: true,
      }),
    ).toEqual({
      useWinptyForCodex: false,
      useConpty: true,
      filterKind: TERMINAL_FILTER_KIND.CODEX_SCROLLBACK,
    });
  });

  it.each(["claude", "none", "shell"])(
    "keeps ConPTY with pass-through output for local Windows %s",
    (aiToolId) => {
      expect(
        resolvePtyBackend({
          platform: "win32",
          aiToolId,
          hasSsh: false,
        }),
      ).toMatchObject({
        useWinptyForCodex: false,
        useConpty: true,
        filterKind: TERMINAL_FILTER_KIND.PASS_THROUGH,
      });
    },
  );

  it("keeps the Codex filter outside Windows", () => {
    expect(
      resolvePtyBackend({
        platform: "linux",
        aiToolId: "codex",
        hasSsh: false,
      }),
    ).toMatchObject({
      useWinptyForCodex: false,
      useConpty: true,
      filterKind: TERMINAL_FILTER_KIND.CODEX_SCROLLBACK,
    });
  });
});
