import { invoke } from "@tauri-apps/api/core";
import { toolForId } from "../types";
import type { Agent, SshHost } from "../types";
import { findSshHost } from "./sshHosts";

export type SpawnArgs = {
  initCommand: string | null;
  ssh: {
    host: string;
    user: string;
    port?: number;
    identityFile?: string;
    extraOptions?: string;
    remoteFolder: string | null;
    remoteOs: string;
    authMethod: string;
    hostId: string;
  } | null;
  cwd: string | null;
};

export function resolveRemoteToolCommand(
  aiToolId: string,
  command: string,
  sshHost: Pick<SshHost, "remoteOs" | "preferCmdShim"> | null
): string {
  if (
    !command ||
    sshHost?.remoteOs !== "windows" ||
    sshHost.preferCmdShim === false
  ) {
    return command;
  }

  if (aiToolId === "codex" && command === "codex") return "codex.cmd";
  if (aiToolId === "claude" && command === "claude") return "claude.cmd";
  return command;
}

// Builds the spawn_pty arguments for an agent: resolves the resume session id
// (codex resume / claude --resume), appends the dangerous flag, and assembles
// the ssh descriptor for remote hosts. Shared by the visible-pane spawn
// (PaneSlot) and the background reopen-all spawn (App), so both behave the same.
export async function buildSpawnArgs(
  agent: Agent,
  sessionPins: Record<string, string> | null,
  setAgentSessionId: (id: string, sessionId: string | null) => void
): Promise<SpawnArgs> {
  const tool = toolForId(agent.aiToolId);
  const sshHost = agent.sshHostId ? findSshHost(agent.sshHostId) : null;
  let initCommand: string | null = null;

  if (tool.command) {
    let cmd = resolveRemoteToolCommand(agent.aiToolId, tool.command, sshHost);
    if (sshHost) {
      // Windows remote (Phase 2): remote hooks capture session_id into
      // lastSessionId, so resume directly (no local-disk resolve, which can't
      // see the remote transcript). POSIX remote stays unsupported.
      if (sshHost.remoteOs === "windows") {
        const sessionId = sessionPins?.[agent.id] ?? agent.lastSessionId ?? null;
        if (sessionId) {
          if (agent.aiToolId === "claude") {
            cmd = `${cmd} --resume ${sessionId}`;
          } else if (agent.aiToolId === "codex") {
            cmd = `${cmd} resume ${sessionId}`;
          }
        }
      }
    } else {
      const pinnedSessionId = sessionPins?.[agent.id] ?? null;
      const candidateSessionId = pinnedSessionId ?? agent.lastSessionId ?? null;
      let sessionId: string | null = null;
      if (
        candidateSessionId &&
        agent.folder &&
        (agent.aiToolId === "codex" || agent.aiToolId === "claude")
      ) {
        try {
          const resolved = await invoke<string | null>("resolve_cli_session", {
            aiToolId: agent.aiToolId,
            folder: agent.folder,
            agentName: agent.name,
            preferredSessionId: candidateSessionId,
          });
          sessionId = resolved ?? null;
          if (!pinnedSessionId && agent.lastSessionId !== sessionId) {
            setAgentSessionId(agent.id, sessionId);
          }
        } catch {
          if (!pinnedSessionId && agent.lastSessionId) {
            setAgentSessionId(agent.id, null);
          }
        }
      }
      if (sessionId) {
        if (agent.aiToolId === "codex") {
          cmd = `${cmd} resume ${sessionId}`;
        } else if (agent.aiToolId === "claude") {
          cmd = `${cmd} --resume ${sessionId}`;
        }
      }
    }
    if (agent.dangerous && tool.dangerousFlag) {
      cmd = `${cmd} ${tool.dangerousFlag}`;
    }
    initCommand = cmd;
  }

  const ssh = sshHost
    ? {
        host: sshHost.host,
        user: sshHost.user,
        port: sshHost.port,
        identityFile: sshHost.identityFile,
        extraOptions: sshHost.extraOptions,
        remoteFolder: agent.remoteFolder ?? null,
        remoteOs: sshHost.remoteOs ?? "posix",
        authMethod: sshHost.authMethod ?? "key",
        hostId: sshHost.id,
      }
    : null;

  return { initCommand, ssh, cwd: sshHost ? null : agent.folder || null };
}
