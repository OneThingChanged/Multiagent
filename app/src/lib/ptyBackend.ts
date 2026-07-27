export type WindowsPtyBackend = "conpty" | "winpty";

export function windowsPtyBackendForAgent(
  aiToolId: string,
  sshHostId?: string | null,
): WindowsPtyBackend {
  return aiToolId === "codex" && !sshHostId ? "winpty" : "conpty";
}
