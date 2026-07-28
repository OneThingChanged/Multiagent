export const TERMINAL_FILTER_KIND = Object.freeze({
  CODEX_SCROLLBACK: "codex-scrollback",
  PASS_THROUGH: "pass-through",
});

export const WINDOWS_PTY_BACKEND = Object.freeze({
  CONPTY: "conpty",
  WINPTY: "winpty",
});

/**
 * WinPTY preserves Codex's normal-buffer output as a scrollable stream on
 * Windows builds where ConPTY repeatedly rewrites the viewport. Local Codex
 * can opt into ConPTY for true-color output; keep ConPTY for SSH and every
 * other tool because those paths do not share the compatibility issue.
 */
export function resolvePtyBackend({
  platform = process.platform,
  aiToolId = "",
  hasSsh = false,
  requestedBackend = WINDOWS_PTY_BACKEND.WINPTY,
} = {}) {
  const localWindowsCodex =
    platform === "win32" && !hasSsh && aiToolId === "codex";
  const useWinptyForCodex =
    localWindowsCodex && requestedBackend !== WINDOWS_PTY_BACKEND.CONPTY;
  return {
    useWinptyForCodex,
    useConpty: !useWinptyForCodex,
    filterKind:
      aiToolId === "codex" && !useWinptyForCodex
        ? TERMINAL_FILTER_KIND.CODEX_SCROLLBACK
        : TERMINAL_FILTER_KIND.PASS_THROUGH,
  };
}
