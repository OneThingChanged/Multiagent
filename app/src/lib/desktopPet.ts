import type { Agent, Project } from "../types";

export const LS_DESKTOP_PET_ENABLED = "multiagent.desktopPetEnabled.v1";

export type DesktopPetStatus = "idle" | "running" | "working" | "done";

export type DesktopPetCompletion = {
  key: string;
  agentId: string;
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
    "id" | "name" | "projectId" | "aiToolId" | "status"
  >[],
  projects: Pick<Project, "id" | "name">[],
  questions: Record<string, string>,
  completions: DesktopPetCompletion[]
): DesktopPetUpdate {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const workingItems = agents
    .filter((agent) => agent.status === "working")
    .map((agent) => ({
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
    }));
  const workingCount = workingItems.length;
  const runningCount = agents.filter(
    (agent) =>
      agent.status === "starting" ||
      agent.status === "running" ||
      agent.status === "working"
  ).length;
  const latest = completions[completions.length - 1] ?? null;

  const status: DesktopPetStatus = latest
    ? "done"
    : workingCount > 0
      ? "working"
      : runningCount > 0
        ? "running"
        : "idle";

  return {
    status,
    workingCount,
    workingItems,
    completedCount: completions.length,
    title: latest?.title ?? null,
    body: latest?.body ?? null,
    agentId: latest?.agentId ?? null,
    notificationKey: latest?.key ?? null,
    question: latest?.question ?? null,
  };
}

export function completionForAgent(
  agent: Pick<Agent, "id" | "name" | "projectId">,
  projects: Pick<Project, "id" | "name">[],
  question?: string | null
): DesktopPetCompletion {
  const project = projects.find((candidate) => candidate.id === agent.projectId);
  return {
    key: `${Date.now()}-${crypto.randomUUID()}`,
    agentId: agent.id,
    title: `${project?.name || "Unknown project"} / ${agent.name}`,
    body: question ? `완료 · ${question.trim()}` : "작업이 끝났어요",
    question: question?.trim() || null,
  };
}
