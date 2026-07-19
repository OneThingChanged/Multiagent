// External diff program command, configured in Settings → Version Control and
// passed to the git_diff_tool IPC per invocation. Stored client-side like the
// SSH hosts / notification sound settings. $LOCAL / $REMOTE are substituted
// with the "before" (HEAD/index) and working-tree file paths; if neither
// placeholder is present the two paths are appended.
const DIFF_TOOL_KEY = "multiagent.diffTool.v1";

export function loadDiffToolCommand(): string {
  try {
    return localStorage.getItem(DIFF_TOOL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveDiffToolCommand(command: string): void {
  try {
    localStorage.setItem(DIFF_TOOL_KEY, command);
  } catch {
    // Ignore storage failures (private mode, quota) — the field just won't persist.
  }
}
