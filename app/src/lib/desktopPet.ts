import type { Agent, Project } from "../types";

export const LS_DESKTOP_PET_ENABLED = "multiagent.desktopPetEnabled.v1";

export type DesktopPetStatus = "idle" | "running" | "working" | "done";

export type DesktopPetCompletion = {
  key: string;
  agentId: string;
  sessionKey: string;
  title: string;
  body: string;
  question: string | null;
};

export type DesktopPetWorkingItem = {
  agentId: string;
  projectName: string;
  agentName: string;
  tool: string;
  question: string | null;
};

export type DesktopPetUpdate = {
  status: DesktopPetStatus;
  workingCount: number;
  workingItems: DesktopPetWorkingItem[];
  completedCount: number;
  title: string | null;
  body: string | null;
  agentId: string | null;
  notificationKey: string | null;
  question: string | null;
};

export function loadDesktopPetEnabled(): boolean {
  try {
    const stored = localStorage.getItem(LS_DESKTOP_PET_ENABLED);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function saveDesktopPetEnabled(enabled: boolean) {
  try {
    localStorage.setItem(LS_DESKTOP_PET_ENABLED, String(enabled));
  } catch {}
}

export function buildDesktopPetUpdate(
  agents: Pick<
    Agent,
    "id" | "name" | "projectId" | "aiToolId" | "status" | "lastSessionId"
  >[],
  projects: Pick<Project, "id" | "name">[],
  questions: Record<string, string>,
  completions: DesktopPetCompletion[]
): DesktopPetUpdate {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const workingBySession = new Map<string, DesktopPetWorkingItem>();
  for (const agent of agents.filter((candidate) => candidate.status === "working")) {
    const sessionKey = agent.lastSessionId?.trim() || agent.id;
    if (workingBySession.has(sessionKey)) continue;
    workingBySession.set(sessionKey, {
      agentId: agent.id,
      projectName: projectNames.get(agent.projectId) || "Unknown project",
      agentName: agent.name,
      tool:
        agent.aiToolId === "claude"
          ? "Claude"
          : agent.aiToolId === "codex"
            ? "Codex"
            : "Shell",
      question: questions[agent.id]?.trim() || null,
    });
  }
  const workingItems = [...workingBySession.values()];
  const workingCount = workingItems.length;
  const runningCount = new Set(
    agents
      .filter(
        (agent) =>
      agent.status === "starting" ||
      agent.status === "running" ||
      agent.status === "working"
      )
      .map((agent) => agent.lastSessionId?.trim() || agent.id)
  ).size;
  const workingSessionKeys = new Set(workingBySession.keys());
  const completionBySession = new Map<string, DesktopPetCompletion>();
  for (const completion of completions) {
    if (workingSessionKeys.has(completion.sessionKey)) continue;
    // Reinsert so Map order also reflects the latest completion per session.
    completionBySession.delete(completion.sessionKey);
    completionBySession.set(completion.sessionKey, completion);
  }
  const uniqueCompletions = [...completionBySession.values()];
  const latest = uniqueCompletions[uniqueCompletions.length - 1] ?? null;

  const status: DesktopPetStatus = workingCount > 0
    ? "working"
    : latest
      ? "done"
      : runningCount > 0
        ? "running"
        : "idle";

  return {
    status,
    workingCount,
    workingItems,
    completedCount: uniqueCompletions.length,
    title: latest?.title ?? null,
    body: latest?.body ?? null,
    agentId: latest?.agentId ?? null,
    notificationKey: latest?.key ?? null,
    question: latest?.question ?? null,
  };
}

export function completionForAgent(
  agent: Pick<Agent, "id" | "name" | "projectId" | "lastSessionId">,
  projects: Pick<Project, "id" | "name">[],
  question?: string | null
): DesktopPetCompletion {
  const project = projects.find((candidate) => candidate.id === agent.projectId);
  return {
    key: `${Date.now()}-${crypto.randomUUID()}`,
    agentId: agent.id,
    sessionKey: agent.lastSessionId?.trim() || agent.id,
    title: `${project?.name || "Unknown project"} / ${agent.name}`,
    body: question ? `완료 · ${question.trim()}` : "작업이 끝났어요",
    question: question?.trim() || null,
  };
}
