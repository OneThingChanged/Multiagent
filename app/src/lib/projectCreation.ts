import {
  AI_TOOLS,
  toolForId,
  type Agent,
  type NewProjectPayload,
  type Project,
} from "../types";
import { defaultSessionWorkerSettings } from "./sessionWorkers";

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
    projectFolderId: payload.projectFolderId || undefined,
  };
  const tool = toolForId(payload.aiToolId);
  const agent: Agent = {
    id: createId(),
    projectId,
    name: "Session 1",
    folder: project.folder,
    aiToolId: tool.id,
    aiLabel: tool.label,
    codexAccountId: !sshHostId && tool.id === "codex" ? payload.codexAccountId : undefined,
    dangerous: payload.dangerous && !!tool.dangerousFlag,
    workerSettings: defaultSessionWorkerSettings(tool.id),
    status: "starting",
    runtimeStatus: "starting",
    createdAt: now,
    sshHostId: project.sshHostId,
    remoteFolder: project.remoteFolder,
  };
  return { project, agent };
}
