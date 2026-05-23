import {
  LS_AGENTS,
  LS_GROUPS,
  LS_LAYOUT_LEGACY,
  LS_VIEW,
  toolForId,
} from "../types";
import type {
  Agent,
  AgentStatus,
  Group,
  LayoutNode,
  Path,
  StoredAgent,
} from "../types";
import {
  collectAgentIds,
  firstLeafPath,
  getAt,
  makeLeaf,
  validateLayout,
} from "./layout";

export function loadStoredAgents(): Agent[] {
  try {
    const raw = localStorage.getItem(LS_AGENTS);
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredAgent[];
    return stored.map((c) => ({
      id: c.id,
      name: c.name,
      folder: c.folder,
      aiToolId: c.aiToolId,
      aiLabel: toolForId(c.aiToolId).label,
      dangerous: !!c.dangerous,
      createdAt: c.createdAt,
      // Migrate legacy fields: prefer new lastSessionId, fall back to either
      // older field (both held the same session UUID).
      lastSessionId:
        c.lastSessionId ?? c.lastClaudeSessionId ?? c.lastResumeToken,
      status: "idle" as AgentStatus,
    }));
  } catch {
    return [];
  }
}

export function loadStoredGroups(validIds: Set<string>): Group[] {
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
        for (const aid of seen) used.add(aid);
        const sessionPins = sanitizeSessionPins(g.sessionPins, lay);
        groups.push({
          id: g.id || crypto.randomUUID(),
          layout: lay,
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
          layout: makeLeaf(aid),
        });
      }
    }
    return groups;
  } catch {
    return Array.from(validIds).map((aid) => ({
      id: crypto.randomUUID(),
      layout: makeLeaf(aid),
    }));
  }
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
): { activeGroupId: string | null; activePath: Path | null } {
  try {
    const raw = localStorage.getItem(LS_VIEW);
    if (!raw) return { activeGroupId: null, activePath: null };
    const v = JSON.parse(raw) as {
      activeGroupId: string | null;
      activePath: Path | null;
    };
    const group = groups.find((g) => g.id === v.activeGroupId);
    if (!group) return { activeGroupId: null, activePath: null };
    if (v.activePath && getAt(group.layout, v.activePath)) {
      return v;
    }
    return {
      activeGroupId: group.id,
      activePath: firstLeafPath(group.layout),
    };
  } catch {
    return { activeGroupId: null, activePath: null };
  }
}

export type Bootstrap = {
  agents: Agent[];
  groups: Group[];
  activeGroupId: string | null;
  activePath: Path | null;
};

export function loadBootstrap(): Bootstrap {
  const agents = loadStoredAgents();
  const groups = loadStoredGroups(new Set(agents.map((a) => a.id)));
  const view = loadStoredView(groups);
  return {
    agents,
    groups,
    activeGroupId: view.activeGroupId,
    activePath: view.activePath,
  };
}
