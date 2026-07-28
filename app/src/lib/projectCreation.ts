import {
  AI_TOOLS,
  toolForId,
  type Agent,
  type NewProjectPayload,
  type Project,
} from "../types";

export function defaultAiToolId(disabledTools: readonly string[]): string {
  return (
    AI_TOOLS.find(
      (tool) => tool.id === "none" || !disabledTools.includes(tool.id)
    )?.id ?? "none"
  );
}

export function buildNewProjectWithFirstAgent(
  payload: NewProjectPayload,
  options: {
    createId?: () => string;
    now?: number;
  } = {}
): { project: Project; agent: Agent } {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? Date.now();
  const projectId = createId();
  const sshHostId = payload.sshHostId?.trim() || undefined;
  const project: Project = {
    id: projectId,
    name: payload.name.trim() || "Project",
    folder: payload.folder.trim(),
    createdAt: now,
    lastOpenedAt: now,
    sshHostId,
    remoteFolder: sshHostId
      ? payload.remoteFolder?.trim() || undefined
      : undefined,
  };
  const tool = toolForId(payload.aiToolId);
  const agent: Agent = {
    id: createId(),
    projectId,
    name: "Session 1",
    folder: project.folder,
    aiToolId: tool.id,
    aiLabel: tool.label,
    dangerous: false,
    status: "starting",
    runtimeStatus: "starting",
    createdAt: now,
    sshHostId: project.sshHostId,
    remoteFolder: project.remoteFolder,
  };
  return { project, agent };
}
