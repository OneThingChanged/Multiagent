import type { Agent } from "../types";

export function switchCodexAccount(agent: Agent, accountId: string): Agent {
  const previous = agent.codexAccountId || "default";
  if (previous === accountId) return agent;
  const sessions = { ...agent.codexAccountSessions };
  if (agent.lastSessionId) sessions[previous] = agent.lastSessionId;
  else delete sessions[previous];
  return { ...agent, codexAccountId: accountId, codexAccountSessions: sessions,
    lastSessionId: sessions[accountId], deferredStart: true,
    resumeEligible: false, status: "idle", runtimeStatus: "idle", activity: undefined };
}
