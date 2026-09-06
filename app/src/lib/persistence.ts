import {
  LS_AGENTS,
  LS_GROUPS,
  LS_LAYOUT_LEGACY,
  LS_PROJECT_FOLDERS,
  LS_PROJECTS,
  LS_VIEW,
  toolForId,
} from "../types";
import type {
  Agent,
  AgentStatus,
  Group,
  LayoutNode,
  Path,
  Project,
  ProjectFolder,
  StoredAgent,
  StoredProject,
  StoredProjectFolder,
} from "../types";
import {
  activeAgentInLeaf,
  collectAgentIds,
  findLeafPath,
  firstLeafPath,
  getAt,
  groupOf,
  makeLeaf,
  pruneAgent,
  validateLayout,
} from "./layout";
import { normalizeSessionWorkerSettings } from "./sessionWorkers";

function projectNameFromFolder(folder: string) {
  const normalized = folder.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "Project";
}

function readStoredAgents(): StoredAgent[] {
  try {
    const raw = localStorage.getItem(LS_AGENTS);
    if (!raw) return [];
    return JSON.parse(raw) as StoredAgent[];
  } catch {
    return [];
  }
}

function loadStoredProjects(rawAgents: StoredAgent[]): Project[] {
  const existing = new Map<string, Project>();
  try {
    const raw = localStorage.getItem(LS_PROJECTS);
    if (raw) {
      for (const project of JSON.parse(raw) as StoredProject[]) {
        // SSH projects may have no local folder; still require an id. Keep even
        // folder-less projects so agents that reference them are never dropped
        // (losing every session on restore when project metadata is partial).
        if (!project.id) continue;
        existing.set(project.id, {
          id: project.id,
          name: project.name || projectNameFromFolder(project.folder || ""),
          folder: project.folder || "",
          createdAt: project.createdAt || Date.now(),
          lastOpenedAt: project.lastOpenedAt,
          sshHostId: project.sshHostId || undefined,
          remoteFolder: project.remoteFolder || undefined,
          projectFolderId: project.projectFolderId || undefined,
        });
      }
    }
  } catch {}

  const byFolder = new Map(
    Array.from(existing.values()).map((project) => [project.folder, project])
  );
  for (const agent of rawAgents) {
    if (agent.projectId && existing.has(agent.projectId)) continue;
    if (agent.folder && byFolder.has(agent.folder)) continue;

    // Every stored session must map to a project or loadStoredAgents drops it.
    // Prefer a folder-derived project; for a folder-less agent whose project
    // didn't survive, recover a placeholder keyed by its own projectId so the
    // session still appears (and stays restorable) instead of disappearing.
    if (agent.folder) {
      const project: Project = {
        id: crypto.randomUUID(),
        name: projectNameFromFolder(agent.folder),
        folder: agent.folder,
        createdAt: agent.createdAt || Date.now(),
        lastOpenedAt: agent.createdAt,
      };
      existing.set(project.id, project);
      byFolder.set(project.folder, project);
    } else if (agent.projectId) {
      existing.set(agent.projectId, {
        id: agent.projectId,
        name: agent.name || "Recovered project",
        folder: "",
        createdAt: agent.createdAt || Date.now(),
        lastOpenedAt: agent.createdAt,
      });
    }
  }

  return Array.from(existing.values()).sort(
    (a, b) =>
      (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt)
  );
}

function loadStoredProjectFolders(): ProjectFolder[] {
  try {
    const raw = localStorage.getItem(LS_PROJECT_FOLDERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredProjectFolder[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (folder) =>
          !!folder &&
          typeof folder.id === "string" &&
          folder.id.length > 0 &&
          typeof folder.name === "string" &&
          folder.name.trim().length > 0
      )
      .map((folder) => ({
        id: folder.id,
        name: folder.name.trim(),
        machineKey:
          typeof folder.machineKey === "string" && folder.machineKey
            ? folder.machineKey
            : "local",
        createdAt: folder.createdAt || Date.now(),
      }));
  } catch {
    return [];
  }
}

function loadStoredAgents(rawAgents: StoredAgent[], projects: Project[]): Agent[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const byFolder = new Map(projects.map((project) => [project.folder, project]));

  return rawAgents.flatMap((c) => {
    const project = (c.projectId && byId.get(c.projectId)) || byFolder.get(c.folder);
    if (!project) return [];
    return [
      {
        id: c.id,
        projectId: project.id,
        name: c.name,
        folder: project.folder,
        aiToolId: c.aiToolId,
        aiLabel: toolForId(c.aiToolId).label,
        dangerous: !!c.dangerous,
        useAltScreen: c.useAltScreen || undefined,
        workerSettings: normalizeSessionWorkerSettings(c.workerSettings),
        pinned: c.pinned || undefined,
        tabColor: c.tabColor || undefined,
        createdAt: c.createdAt,
        // Migrate legacy fields: prefer new lastSessionId, fall back to either
        // older field (both held the same session UUID).
        lastSessionId:
          c.lastSessionId ?? c.lastClaudeSessionId ?? c.lastResumeToken,
        status: "idle" as AgentStatus,
        runtimeStatus: "idle",
        resumeEligible: typeof c.resumeEligible === "boolean" ? c.resumeEligible : undefined,
        // Derived from the owning project (not persisted on the agent).
        sshHostId: project.sshHostId,
        remoteFolder: project.remoteFolder,
      },
    ];
  });
}

export function loadStoredGroups(
  validIds: Set<string>,
  agentProjectIds: Map<string, string>,
  storage: {
    groupsKey?: string;
    viewKey?: string;
    migrateLegacyLayout?: boolean;
  } = {}
): Group[] {
  const groupsKey = storage.groupsKey ?? LS_GROUPS;
  const viewKey = storage.viewKey ?? LS_VIEW;
  try {
    const legacy = localStorage.getItem(LS_LAYOUT_LEGACY);
    if (
      legacy &&
      (groupsKey === LS_GROUPS || storage.migrateLegacyLayout) &&
      !localStorage.getItem(groupsKey)
    ) {
      try {
        const parsed = JSON.parse(legacy) as LayoutNode | null;
        const v = validateLayout(parsed, validIds);
        if (v) {
          const migrated: Group[] = [{ id: crypto.randomUUID(), layout: v }];
          localStorage.setItem(groupsKey, JSON.stringify(migrated));
        }
      } catch {}
      localStorage.removeItem(LS_LAYOUT_LEGACY);
    }

    const raw = localStorage.getItem(groupsKey);
    if (!raw) {
      return normalizeStoredGroups([], validIds, agentProjectIds);
    }
    const parsed = JSON.parse(raw) as Group[];
    const groups = normalizeStoredGroups(parsed, validIds, agentProjectIds);
    if (JSON.stringify(parsed) !== JSON.stringify(groups)) {
      localStorage.setItem(groupsKey, JSON.stringify(groups));
      repairStoredViewAfterGroupNormalization(parsed, groups, viewKey);
    }
    return groups;
  } catch {
    return Array.from(validIds).map((aid) => ({
      id: crypto.randomUUID(),
      projectId: agentProjectIds.get(aid),
      layout: makeLeaf(aid),
    }));
  }
}

function repairStoredViewAfterGroupNormalization(
  previousGroups: Group[],
  normalizedGroups: Group[],
  viewKey = LS_VIEW
) {
  try {
    const raw = localStorage.getItem(viewKey);
    if (!raw) return;
    const view = JSON.parse(raw) as {
      activeProjectId?: string | null;
      activeGroupId?: string | null;
      activePath?: Path | null;
    };
    if (!view.activeGroupId) return;

    const currentGroup = normalizedGroups.find(
      (group) => group.id === view.activeGroupId
    );
    if (
      currentGroup &&
      view.activePath &&
      getAt(currentGroup.layout, view.activePath)
    ) {
      return;
    }

    const previousGroup = previousGroups.find(
      (group) => group.id === view.activeGroupId
    );
    if (!previousGroup) return;
    const previousPath =
      view.activePath && getAt(previousGroup.layout, view.activePath)
        ? view.activePath
        : firstLeafPath(previousGroup.layout);
    if (!previousPath) return;
    const previousNode = getAt(previousGroup.layout, previousPath);
    if (!previousNode || previousNode.type !== "leaf") return;
    const agentId = activeAgentInLeaf(previousNode);
    if (!agentId) return;
    const replacement = groupOf(normalizedGroups, agentId);
    if (!replacement) return;
    const replacementPath = findLeafPath(replacement.layout, agentId);
    if (!replacementPath) return;

    localStorage.setItem(
      viewKey,
      JSON.stringify({
        activeProjectId:
          view.activeProjectId ?? replacement.projectId ?? null,
        activeGroupId: replacement.id,
        activePath: replacementPath,
      })
    );
  } catch {}
}

/**
 * Enforce the global layout invariant that every agent belongs to exactly one
 * group. Split groups win over stale solo/tab groups, and the preferred group
 * wins when two split groups both contain the same agent. This repairs layouts
 * written by older union-based multi-window persistence without discarding the
 * visible Screen.
 */
export function normalizeStoredGroups(
  rawGroups: Group[],
  validIds: Set<string>,
  agentProjectIds: Map<string, string>,
  preferredGroupId: string | null = null
): Group[] {
  type Candidate = {
    group: Group;
    layout: LayoutNode;
    agentIds: Set<string>;
    score: number;
  };

  const candidates: Candidate[] = [];
  const usedGroupIds = new Set<string>();
  for (const rawGroup of rawGroups) {
    if (!rawGroup?.layout) continue;
    const localSeen = new Set<string>();
    const layout = validateLayout(rawGroup.layout, validIds, localSeen);
    if (!layout) continue;
    let groupId = rawGroup.id || crypto.randomUUID();
    if (usedGroupIds.has(groupId)) groupId = crypto.randomUUID();
    usedGroupIds.add(groupId);
    candidates.push({
      group: { ...rawGroup, id: groupId },
      layout,
      agentIds: collectAgentIds(layout),
      // A real Screen must survive a stale solo duplicate. The active group is
      // only a tie-breaker between groups of the same shape.
      score:
        (layout.type === "split" ? 1_000 : 0) +
        (groupId === preferredGroupId ? 100 : 0),
    });
  }

  const ownerByAgent = new Map<string, { candidateIndex: number; score: number }>();
  candidates.forEach((candidate, candidateIndex) => {
    for (const agentId of candidate.agentIds) {
      const owner = ownerByAgent.get(agentId);
      if (!owner || candidate.score > owner.score) {
        ownerByAgent.set(agentId, { candidateIndex, score: candidate.score });
      }
    }
  });

  const groups: Group[] = [];
  const usedAgentIds = new Set<string>();
  candidates.forEach((candidate, candidateIndex) => {
    let layout: LayoutNode | null = candidate.layout;
    for (const agentId of candidate.agentIds) {
      if (ownerByAgent.get(agentId)?.candidateIndex !== candidateIndex) {
        layout = pruneAgent(layout, agentId);
      }
    }
    if (!layout) return;

    const actualAgentIds = collectAgentIds(layout);
    for (const agentId of actualAgentIds) usedAgentIds.add(agentId);
    const sessionPins = sanitizeSessionPins(candidate.group.sessionPins, layout);
    groups.push({
      id: candidate.group.id,
      projectId:
        candidate.group.projectId ||
        Array.from(actualAgentIds)
          .map((agentId) => agentProjectIds.get(agentId))
          .find(Boolean),
      layout,
      sessionPins,
      sessionLocked:
        !!candidate.group.sessionLocked &&
        Object.keys(sessionPins ?? {}).length > 0
          ? true
          : undefined,
    });
  });

  for (const agentId of validIds) {
    if (usedAgentIds.has(agentId)) continue;
    groups.push({
      id: crypto.randomUUID(),
      projectId: agentProjectIds.get(agentId),
      layout: makeLeaf(agentId),
    });
  }
  return groups;
}

function sanitizeSessionPins(
  rawPins: unknown,
  layout: LayoutNode
): Record<string, string> | undefined {
  if (!rawPins || typeof rawPins !== "object") return undefined;

  const agentIds = collectAgentIds(layout);
  const pins: Record<string, string> = {};
  for (const [agentId, sessionId] of Object.entries(rawPins)) {
    if (!agentIds.has(agentId)) continue;
    if (typeof sessionId !== "string" || !sessionId.trim()) continue;
    pins[agentId] = sessionId;
  }

  return Object.keys(pins).length > 0 ? pins : undefined;
}

export function loadStoredView(
  groups: Group[],
  viewKey = LS_VIEW
): {
  activeProjectId: string | null;
  activeGroupId: string | null;
  activePath: Path | null;
} {
  try {
    const raw = localStorage.getItem(viewKey);
    if (!raw) {
      return { activeProjectId: null, activeGroupId: null, activePath: null };
    }
    const v = JSON.parse(raw) as {
      activeProjectId?: string | null;
      activeGroupId: string | null;
      activePath: Path | null;
    };
    const group = groups.find((g) => g.id === v.activeGroupId);
    if (!group) {
      return {
        activeProjectId: v.activeProjectId ?? null,
        activeGroupId: null,
        activePath: null,
      };
    }
    if (v.activePath && getAt(group.layout, v.activePath)) {
      return {
        activeProjectId: v.activeProjectId ?? group.projectId ?? null,
        activeGroupId: v.activeGroupId,
        activePath: v.activePath,
      };
    }
    return {
      activeProjectId: v.activeProjectId ?? group.projectId ?? null,
      activeGroupId: group.id,
      activePath: firstLeafPath(group.layout),
    };
  } catch {
    return { activeProjectId: null, activeGroupId: null, activePath: null };
  }
}

export type Bootstrap = {
  projects: Project[];
  projectFolders: ProjectFolder[];
  agents: Agent[];
  groups: Group[];
  activeProjectId: string | null;
  activeGroupId: string | null;
  activePath: Path | null;
};

export function loadBootstrap(
  storage: {
    groupsKey?: string;
    viewKey?: string;
    migrateLegacyLayout?: boolean;
  } = {}
): Bootstrap {
  const rawAgents = readStoredAgents();
  const projects = loadStoredProjects(rawAgents);
  const projectFolders = loadStoredProjectFolders();
  const agents = loadStoredAgents(rawAgents, projects);
  const agentProjectIds = new Map(agents.map((a) => [a.id, a.projectId]));
  const groups = loadStoredGroups(
    new Set(agents.map((a) => a.id)),
    agentProjectIds,
    storage
  );
  const view = loadStoredView(groups, storage.viewKey);
  const savedProjectId =
    view.activeProjectId &&
    projects.some((project) => project.id === view.activeProjectId)
      ? view.activeProjectId
      : null;
  return {
    projects,
    projectFolders,
    agents,
    groups,
    activeProjectId: savedProjectId ?? projects[0]?.id ?? null,
    activeGroupId: view.activeGroupId,
    activePath: view.activePath,
  };
}
