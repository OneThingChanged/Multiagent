export const TERMINAL_FILTER_KIND = Object.freeze({
  CODEX_SCROLLBACK: "codex-scrollback",
  PASS_THROUGH: "pass-through",
});

/**
 * WinPTY preserves Codex's normal-buffer output as a scrollable stream on
 * Windows builds where ConPTY repeatedly rewrites the viewport. Keep ConPTY
 * for SSH and every other tool because those paths do not share the issue.
 */
export function resolvePtyBackend({
  platform = process.platform,
  aiToolId = "",
  hasSsh = false,
} = {}) {
  const useWinptyForCodex =
    platform === "win32" && !hasSsh && aiToolId === "codex";
  return {
    useWinptyForCodex,
    useConpty: !useWinptyForCodex,
    filterKind:
      aiToolId === "codex" && !useWinptyForCodex
        ? TERMINAL_FILTER_KIND.CODEX_SCROLLBACK
        : TERMINAL_FILTER_KIND.PASS_THROUGH,
  };
}
