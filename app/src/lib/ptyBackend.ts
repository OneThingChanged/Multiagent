export type WindowsPtyBackend = "conpty" | "winpty";

export const DEFAULT_WINDOWS_CODEX_PTY_BACKEND: WindowsPtyBackend = "winpty";
const LS_WINDOWS_CODEX_PTY_BACKEND =
  "multiagent.windowsCodexPtyBackend.v1";

export function parseWindowsPtyBackend(
  value: string | null | undefined,
): WindowsPtyBackend {
  return value === "conpty" || value === "winpty"
    ? value
    : DEFAULT_WINDOWS_CODEX_PTY_BACKEND;
}

export function loadWindowsCodexPtyBackend(): WindowsPtyBackend {
  try {
    return parseWindowsPtyBackend(globalThis.localStorage?.getItem(
      LS_WINDOWS_CODEX_PTY_BACKEND,
    ));
  } catch {
    return DEFAULT_WINDOWS_CODEX_PTY_BACKEND;
  }
}

export function saveWindowsCodexPtyBackend(
  backend: WindowsPtyBackend,
): void {
  try {
    globalThis.localStorage?.setItem(LS_WINDOWS_CODEX_PTY_BACKEND, backend);
  } catch {
    // Storage can be unavailable in hardened/private renderer contexts.
  }
}

export function windowsPtyBackendForAgent(
  aiToolId: string,
  sshHostId?: string | null,
  preferredCodexBackend = loadWindowsCodexPtyBackend(),
): WindowsPtyBackend {
  return aiToolId === "codex" && !sshHostId
    ? preferredCodexBackend
    : "conpty";
}
