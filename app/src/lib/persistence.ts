import {
  LS_AGENTS,
  LS_GROUPS,
  LS_LAYOUT_LEGACY,
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
  StoredAgent,
  StoredProject,
} from "../types";
import {
  collectAgentIds,
  firstLeafPath,
  getAt,
  makeLeaf,
  normalizeSizes,
  validateLayout,
} from "./layout";

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
        if (!project.id || !project.folder) continue;
        existing.set(project.id, {
          id: project.id,
          name: project.name || projectNameFromFolder(project.folder),
          folder: project.folder,
          createdAt: project.createdAt || Date.now(),
          lastOpenedAt: project.lastOpenedAt,
        });
      }
    }
  } catch {}

  const byFolder = new Map(
    Array.from(existing.values()).map((project) => [project.folder, project])
  );
  for (const agent of rawAgents) {
    if (agent.projectId && existing.has(agent.projectId)) continue;
    if (!agent.folder) continue;
    if (byFolder.has(agent.folder)) continue;

    const project: Project = {
      id: crypto.randomUUID(),
      name: projectNameFromFolder(agent.folder),
      folder: agent.folder,
      createdAt: agent.createdAt || Date.now(),
      lastOpenedAt: agent.createdAt,
    };
    existing.set(project.id, project);
    byFolder.set(project.folder, project);
  }

  return Array.from(existing.values()).sort(
    (a, b) =>
      (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt)
  );
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
        createdAt: c.createdAt,
        // Migrate legacy fields: prefer new lastSessionId, fall back to either
        // older field (both held the same session UUID).
        lastSessionId:
          c.lastSessionId ?? c.lastClaudeSessionId ?? c.lastResumeToken,
        status: "idle" as AgentStatus,
      },
    ];
  });
}

export function loadStoredGroups(
  validIds: Set<string>,
  agentProjectIds: Map<string, string>
): Group[] {
  try {
    const legacy = localStorage.getItem(LS_LAYOUT_LEGACY);
    if (legacy && !localStorage.getItem(LS_GROUPS)) {
      try {
        const parsed = JSON.parse(legacy) as LayoutNode | null;
        const v = validateLayout(parsed, validIds);
        if (v) {
          const migrated: Group[] = [{ id: crypto.randomUUID(), layout: v }];
          localStorage.setItem(LS_GROUPS, JSON.stringify(migrated));
        }
      } catch {}
      localStorage.removeItem(LS_LAYOUT_LEGACY);
    }

    const raw = localStorage.getItem(LS_GROUPS);
    if (!raw) {
      return Array.from(validIds).map((aid) => ({
        id: crypto.randomUUID(),
        projectId: agentProjectIds.get(aid),
        layout: makeLeaf(aid),
      }));
    }
    const parsed = JSON.parse(raw) as Group[];

    const used = new Set<string>();
    const groups: Group[] = [];
    for (const g of parsed) {
      const seen = new Set<string>();
      const lay = validateLayout(g.layout, validIds, seen);
      if (lay) {
        const projectId =
          g.projectId ||
          Array.from(seen)
            .map((agentId) => agentProjectIds.get(agentId))
            .find(Boolean);
        const projectAgentIds = new Set(
          Array.from(seen).filter(
            (agentId) => agentProjectIds.get(agentId) === projectId
          )
        );
        const projectLayout = pruneAgentsOutsideProject(lay, projectAgentIds);
        if (!projectId || !projectLayout) continue;
        for (const aid of projectAgentIds) used.add(aid);
        const sessionPins = sanitizeSessionPins(g.sessionPins, projectLayout);
        groups.push({
          id: g.id || crypto.randomUUID(),
          projectId,
          layout: projectLayout,
          sessionPins,
          sessionLocked:
            !!g.sessionLocked && Object.keys(sessionPins ?? {}).length > 0
              ? true
              : undefined,
        });
      }
    }

    for (const aid of validIds) {
      if (!used.has(aid)) {
        groups.push({
          id: crypto.randomUUID(),
          projectId: agentProjectIds.get(aid),
          layout: makeLeaf(aid),
        });
      }
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

function pruneAgentsOutsideProject(
  layout: LayoutNode,
  projectAgentIds: Set<string>
): LayoutNode | null {
  let next: LayoutNode | null = layout;
  for (const agentId of collectAgentIds(layout)) {
    if (!projectAgentIds.has(agentId)) {
      next = next ? pruneAgentFromLayout(next, agentId) : null;
    }
  }
  return next;
}

function pruneAgentFromLayout(
  layout: LayoutNode,
  agentId: string
): LayoutNode | null {
  if (layout.type === "leaf") {
    const tabs = layout.tabs.filter((tab) => tab !== agentId);
    if (tabs.length === 0) return null;
    return {
      ...layout,
      tabs,
      activeIndex: Math.min(layout.activeIndex, tabs.length - 1),
    };
  }
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < layout.children.length; i += 1) {
    const child = pruneAgentFromLayout(layout.children[i], agentId);
    if (child) {
      children.push(child);
      sizes.push(layout.sizes[i] ?? 1);
    }
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...layout, children, sizes: normalizeSizes(sizes) };
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
  groups: Group[]
): {
  activeProjectId: string | null;
  activeGroupId: string | null;
  activePath: Path | null;
} {
  try {
    const raw = localStorage.getItem(LS_VIEW);
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
  agents: Agent[];
  groups: Group[];
  activeProjectId: string | null;
  activeGroupId: string | null;
  activePath: Path | null;
};

export function loadBootstrap(): Bootstrap {
  const rawAgents = readStoredAgents();
  const projects = loadStoredProjects(rawAgents);
  const agents = loadStoredAgents(rawAgents, projects);
  const agentProjectIds = new Map(agents.map((a) => [a.id, a.projectId]));
  const groups = loadStoredGroups(
    new Set(agents.map((a) => a.id)),
    agentProjectIds
  );
  const view = loadStoredView(groups);
  const activeGroup = groups.find((group) => group.id === view.activeGroupId);
  const savedProjectId =
    view.activeProjectId &&
    projects.some((project) => project.id === view.activeProjectId)
      ? view.activeProjectId
      : null;
  const activeProjectId =
    activeGroup?.projectId ?? savedProjectId ?? projects[0]?.id ?? null;
  const fallbackGroup =
    !activeGroup && activeProjectId
      ? groups.find((group) => group.projectId === activeProjectId)
      : null;
  return {
    projects,
    agents,
    groups,
    activeProjectId,
    activeGroupId: activeGroup?.id ?? fallbackGroup?.id ?? null,
    activePath:
      activeGroup || !fallbackGroup
        ? view.activePath
        : firstLeafPath(fallbackGroup.layout),
  };
}
