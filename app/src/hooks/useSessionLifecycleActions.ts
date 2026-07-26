import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  Agent,
  AgentRuntimeStatus,
  AgentStatus,
  TerminalEntry,
} from "../types";
import * as groupOps from "../lib/groupOps";
import { applyAgentRuntimeStatus } from "../lib/agentActivity";
import { clearScrollback } from "../lib/scrollback";
import { sessionDeletionMessage } from "../lib/sessionLifecycle";
import { invoke } from "../platform/runtime";
import { isElectronRuntime } from "../platform/electronBridge";

type RefValue<T> = { current: T };
type ApplyGroupOp = (
  operation: (state: groupOps.GroupState) => groupOps.GroupState
) => void;

type SessionLifecycleOptions = {
  agentsRef: RefValue<Agent[]>;
  detachedAgentIdsRef: RefValue<Set<string>>;
  removedAgentIdsRef: RefValue<Set<string>>;
  termsRef: RefValue<Map<string, TerminalEntry>>;
  setAgents: Dispatch<SetStateAction<Agent[]>>;
  applyGroupOp: ApplyGroupOp;
};

function disposeTerminal(
  termsRef: RefValue<Map<string, TerminalEntry>>,
  agentId: string
) {
  const entry = termsRef.current.get(agentId);
  if (!entry) return;
  try {
    entry.term.dispose();
  } catch {}
  termsRef.current.delete(agentId);
}

export function useSessionLifecycleActions({
  agentsRef,
  detachedAgentIdsRef,
  removedAgentIdsRef,
  termsRef,
  setAgents,
  applyGroupOp,
}: SessionLifecycleOptions) {
  const recoverExitedAgent = useCallback(async (agentId: string) => {
    const wasIdle =
      agentsRef.current.find((agent) => agent.id === agentId)?.status === "idle";
    if (isElectronRuntime()) {
      await invoke("terminal_session_action", {
        id: agentId,
        action: "restart",
      }).catch(() => {});
    } else {
      await invoke("kill_pty", { id: agentId }).catch(() => {});
    }
    disposeTerminal(termsRef, agentId);
    clearScrollback(agentId);
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId
          ? applyAgentRuntimeStatus(agent, wasIdle ? "starting" : "idle")
          : agent
      )
    );
  }, [agentsRef, setAgents, termsRef]);

  const deactivateAgent = useCallback(async (agentId: string) => {
    // Remove the pane before stopping the PTY. Otherwise the still-mounted
    // terminal can observe the exit and immediately try to spawn again.
    applyGroupOp((state) =>
      groupOps.removeAgentFromLayout(state, agentId)
    );
    disposeTerminal(termsRef, agentId);
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId
          ? applyAgentRuntimeStatus(agent, "idle")
          : agent
      )
    );
    if (isElectronRuntime()) {
      await invoke("terminal_session_action", {
        id: agentId,
        action: "sleep",
      }).catch(() => {});
    } else {
      await invoke("kill_pty", { id: agentId }).catch(() => {});
    }
    // The PTY exit event may race this action and temporarily mark the agent
    // as exited/running. Deactivation is authoritative, so settle on idle.
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId
          ? applyAgentRuntimeStatus(agent, "idle")
          : agent
      )
    );
  }, [applyGroupOp, setAgents, termsRef]);

  const setAgentStatus = useCallback(
    (agentId: string, status: AgentStatus) => {
      setAgents((current) =>
        current.map((agent) => {
          if (agent.id !== agentId) return agent;
          if (
            status === "idle" ||
            status === "starting" ||
            status === "running" ||
            status === "exited" ||
            status === "unreachable"
          ) {
            return applyAgentRuntimeStatus(
              agent,
              status as AgentRuntimeStatus
            );
          }
          return { ...agent, runtimeStatus: "running", status };
        })
      );
    },
    [setAgents]
  );

  const setAgentSessionId = useCallback(
    (agentId: string, sessionId: string | null) => {
      setAgents((current) =>
        current.map((agent) =>
          agent.id === agentId
            ? { ...agent, lastSessionId: sessionId || undefined }
            : agent
        )
      );
    },
    [setAgents]
  );

  const removeAgent = useCallback(async (agentId: string) => {
    const agent = agentsRef.current.find(
      (candidate) => candidate.id === agentId
    );
    if (!agent) return;
    if (detachedAgentIdsRef.current.has(agentId)) {
      window.alert(
        "다른 작업창에서 사용 중인 세션입니다. 해당 창에서 먼저 비활성화해 주세요."
      );
      return;
    }
    if (!window.confirm(sessionDeletionMessage(agent.name))) return;

    removedAgentIdsRef.current.add(agentId);
    await invoke(
      isElectronRuntime() ? "terminal_session_action" : "kill_pty",
      isElectronRuntime()
        ? { id: agentId, action: "close" }
        : { id: agentId }
    ).catch(() => {});
    disposeTerminal(termsRef, agentId);
    clearScrollback(agentId);
    setAgents((current) =>
      current.filter((agent) => agent.id !== agentId)
    );
    applyGroupOp((state) =>
      groupOps.removeAgentFromLayout(state, agentId)
    );
  }, [
    agentsRef,
    applyGroupOp,
    detachedAgentIdsRef,
    removedAgentIdsRef,
    setAgents,
    termsRef,
  ]);

  return {
    recoverExitedAgent,
    deactivateAgent,
    setAgentStatus,
    setAgentSessionId,
    removeAgent,
  };
}
