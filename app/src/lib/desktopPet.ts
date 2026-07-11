import type { Agent, Project } from "../types";

export const LS_DESKTOP_PET_ENABLED = "multiagent.desktopPetEnabled.v1";

export type DesktopPetStatus = "idle" | "running" | "working" | "done";

export type DesktopPetCompletion = {
  key: string;
  agentId: string;
  title: string;
  body: string;
};

export type DesktopPetUpdate = {
  status: DesktopPetStatus;
  workingCount: number;
  completedCount: number;
  title: string | null;
  body: string | null;
  agentId: string | null;
  notificationKey: string | null;
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
  agents: Pick<Agent, "status">[],
  completions: DesktopPetCompletion[]
): DesktopPetUpdate {
  const workingCount = agents.filter((agent) => agent.status === "working").length;
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
    completedCount: completions.length,
    title: latest?.title ?? null,
    body: latest?.body ?? null,
    agentId: latest?.agentId ?? null,
    notificationKey: latest?.key ?? null,
  };
}

export function completionForAgent(
  agent: Pick<Agent, "id" | "name" | "projectId">,
  projects: Pick<Project, "id" | "name">[]
): DesktopPetCompletion {
  const project = projects.find((candidate) => candidate.id === agent.projectId);
  return {
    key: `${Date.now()}-${crypto.randomUUID()}`,
    agentId: agent.id,
    title: `${project?.name || "Unknown project"} / ${agent.name}`,
    body: "작업이 끝났어요",
  };
}
