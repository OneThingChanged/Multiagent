import type { DropZone, Group, LayoutNode, Path } from "../types";
import {
  addTabToLeafAt,
  collectAgentIds,
  findLeafPath,
  findLeafPathById,
  firstLeafPath,
  getAt,
  groupOf,
  insertNextTo,
  makeLeaf,
  pathEq,
  pruneAgent,
  setAt,
  setLeafActiveTab,
  setSizesAt,
  updateGroup,
} from "./layout";

export type GroupState = {
  groups: Group[];
  activeGroupId: string | null;
  activePath: Path | null;
};

function placeIntoSoloGroup(
  state: GroupState,
  agentId: string,
  projectId?: string
): GroupState {
  const newId = crypto.randomUUID();
  return {
    groups: [...state.groups, { id: newId, projectId, layout: makeLeaf(agentId) }],
    activeGroupId: newId,
    activePath: [],
  };
}

function groupContainsAgent(group: Group | null | undefined, agentId: string) {
  return !!group && !!findLeafPath(group.layout, agentId);
}

function preventsIncoming(group: Group | null | undefined, agentId: string) {
  return !!group?.sessionLocked && !groupContainsAgent(group, agentId);
}

function preventsOutgoing(
  group: Group | null | undefined,
  activeGroupId: string | null
) {
  return !!group?.sessionLocked && group.id !== activeGroupId;
}

function groupWithLayoutMetadata(
  source: Group,
  id: string,
  layout: LayoutNode
): Group {
  const agentIds = collectAgentIds(layout);
  const sessionPins = Object.fromEntries(
    Object.entries(source.sessionPins ?? {}).filter(
      ([agentId, sessionId]) => agentIds.has(agentId) && sessionId.trim()
    )
  );
  const hasPins = Object.keys(sessionPins).length > 0;
  return {
    id,
    projectId: source.projectId,
    layout,
    sessionPins: hasPins ? sessionPins : undefined,
    sessionLocked: source.sessionLocked && hasPins ? true : undefined,
  };
}

/**
 * Put one pane and one incoming agent into a two-pane split group. If the
 * target pane already belongs to a split, detach that pane first and leave the
 * former siblings in their existing group. This keeps every newly-created
 * split to one pair while preserving tabs inside the target pane.
 */
function splitIntoPair(
  groups: Group[],
  targetGroupId: string,
  targetLeafId: string,
  agentId: string,
  direction: "h" | "v",
  before: boolean,
  metadataSource: Group
): GroupState | null {
  const targetGroup = groups.find((group) => group.id === targetGroupId);
  if (!targetGroup) return null;
  const targetPath = findLeafPathById(targetGroup.layout, targetLeafId);
  if (!targetPath) return null;
  const targetLeaf = getAt(targetGroup.layout, targetPath);
  if (!targetLeaf || targetLeaf.type !== "leaf") return null;

  const { layout: pairLayout, newPath } = insertNextTo(
    targetLeaf,
    [],
    makeLeaf(agentId),
    direction,
    before
  );
  if (!pairLayout) return null;

  if (targetPath.length === 0) {
    return {
      groups: groups.map((group) =>
        group.id === targetGroupId
          ? groupWithLayoutMetadata(metadataSource, targetGroupId, pairLayout)
          : group
      ),
      activeGroupId: targetGroupId,
      activePath: newPath,
    };
  }

  const remainder = setAt(targetGroup.layout, targetPath, null);
  if (!remainder) return null;
  const remainderGroupId = crypto.randomUUID();
  return {
    groups: [
      ...groups.map((group) =>
        group.id === targetGroupId
          ? groupWithLayoutMetadata(metadataSource, targetGroupId, pairLayout)
          : group
      ),
      groupWithLayoutMetadata(metadataSource, remainderGroupId, remainder),
    ],
    activeGroupId: targetGroupId,
    activePath: newPath,
  };
}

export function selectAgent(
  state: GroupState,
  agentId: string,
  projectId?: string
): GroupState {
  const existing = groupOf(state.groups, agentId);
  if (existing) {
    const path = findLeafPath(existing.layout, agentId);
    if (path) {
      const newLayout = setLeafActiveTab(existing.layout, path, agentId);
      return {
        groups: updateGroup(state.groups, existing.id, newLayout),
        activeGroupId: existing.id,
        activePath: path,
      };
    }
  }
  return placeIntoSoloGroup(state, agentId, projectId);
}

export function addNewAgent(
  state: GroupState,
  agentId: string,
  projectId?: string
): GroupState {
  return placeIntoSoloGroup(state, agentId, projectId);
}

export function openAsTab(
  state: GroupState,
  agentId: string,
  projectId?: string
): GroupState {
  const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
  if (!activeGroup || !state.activePath) {
    return selectAgent(state, agentId, projectId);
  }

  if (preventsIncoming(activeGroup, agentId)) {
    return state;
  }

  const activeLeaf = getAt(activeGroup.layout, state.activePath);
  if (
    activeLeaf &&
    activeLeaf.type === "leaf" &&
    activeLeaf.tabs.includes(agentId)
  ) {
    const lay = setLeafActiveTab(activeGroup.layout, state.activePath, agentId);
    return {
      ...state,
      groups: updateGroup(state.groups, state.activeGroupId!, lay),
    };
  }

  let nextGroups = state.groups;
  const source = groupOf(nextGroups, agentId);
  if (preventsOutgoing(source, state.activeGroupId)) {
    return state;
  }
  if (source) {
    const newSourceLayout = pruneAgent(source.layout, agentId);
    nextGroups = updateGroup(nextGroups, source.id, newSourceLayout);
  }
  const target = nextGroups.find((g) => g.id === state.activeGroupId);
  if (!target) return state;
  const targetPath = state.activePath;
  if (!getAt(target.layout, targetPath)) return state;
  const newLayout = addTabToLeafAt(target.layout, targetPath, agentId);
  return {
    groups: updateGroup(nextGroups, state.activeGroupId!, newLayout),
    activeGroupId: state.activeGroupId,
    activePath: targetPath,
  };
}

export function splitWith(
  state: GroupState,
  agentId: string,
  direction: "h" | "v",
  projectId?: string
): GroupState {
  const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);

  if (!activeGroup || !state.activePath) {
    const existing = groupOf(state.groups, agentId);
    if (existing) {
      return {
        ...state,
        activeGroupId: existing.id,
        activePath: findLeafPath(existing.layout, agentId),
      };
    }
    return placeIntoSoloGroup(state, agentId, projectId);
  }

  if (preventsIncoming(activeGroup, agentId)) {
    return state;
  }

  const inActive = findLeafPath(activeGroup.layout, agentId);
  if (inActive) {
    const lay = setLeafActiveTab(activeGroup.layout, inActive, agentId);
    return {
      groups: updateGroup(state.groups, state.activeGroupId!, lay),
      activeGroupId: state.activeGroupId,
      activePath: inActive,
    };
  }

  const activeLeaf = getAt(activeGroup.layout, state.activePath);
  if (!activeLeaf || activeLeaf.type !== "leaf") return state;

  let nextGroups = state.groups;
  const source = groupOf(nextGroups, agentId);
  if (preventsOutgoing(source, state.activeGroupId)) {
    return state;
  }
  if (source) {
    const newSourceLayout = pruneAgent(source.layout, agentId);
    nextGroups = updateGroup(nextGroups, source.id, newSourceLayout);
  }

  return (
    splitIntoPair(
      nextGroups,
      activeGroup.id,
      activeLeaf.id,
      agentId,
      direction,
      false,
      activeGroup
    ) ?? state
  );
}

export function closeTab(
  state: GroupState,
  path: Path,
  agentId: string,
  projectId?: string
): GroupState {
  const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
  if (!activeGroup) return state;
  const leaf = getAt(activeGroup.layout, path);
  if (!leaf || leaf.type !== "leaf") return state;
  if (!leaf.tabs.includes(agentId)) return state;

  const idx = leaf.tabs.indexOf(agentId);
  const newTabs = leaf.tabs.filter((t) => t !== agentId);
  let newLayout: LayoutNode | null;
  if (newTabs.length === 0) {
    newLayout = setAt(activeGroup.layout, path, null);
  } else {
    let newActive = leaf.activeIndex;
    if (idx < newActive) newActive -= 1;
    if (newActive >= newTabs.length) newActive = newTabs.length - 1;
    if (newActive < 0) newActive = 0;
    newLayout = setAt(activeGroup.layout, path, {
      ...leaf,
      tabs: newTabs,
      activeIndex: newActive,
    });
  }

  let nextGroups = updateGroup(state.groups, state.activeGroupId!, newLayout);
  nextGroups = [
    ...nextGroups,
    {
      id: crypto.randomUUID(),
      projectId: projectId ?? activeGroup.projectId,
      layout: makeLeaf(agentId),
    },
  ];

  if (!newLayout) {
    return { groups: nextGroups, activeGroupId: null, activePath: null };
  }
  if (state.activePath && getAt(newLayout, state.activePath)) {
    return {
      groups: nextGroups,
      activeGroupId: state.activeGroupId,
      activePath: state.activePath,
    };
  }
  return {
    groups: nextGroups,
    activeGroupId: state.activeGroupId,
    activePath: firstLeafPath(newLayout),
  };
}

export function setActiveTabInPane(
  state: GroupState,
  path: Path,
  agentId: string
): GroupState {
  const g = state.groups.find((gg) => gg.id === state.activeGroupId);
  if (!g) return state;
  const newLayout = setLeafActiveTab(g.layout, path, agentId);
  return {
    groups: updateGroup(state.groups, state.activeGroupId!, newLayout),
    activeGroupId: state.activeGroupId,
    activePath: path,
  };
}

export function resizeAt(
  state: GroupState,
  path: Path,
  sizes: number[]
): GroupState {
  const target = state.groups.find((g) => g.id === state.activeGroupId);
  if (!target) return state;
  const newLayout = setSizesAt(target.layout, path, sizes);
  return {
    ...state,
    groups: updateGroup(state.groups, state.activeGroupId!, newLayout),
  };
}

export function removeAgentFromLayout(
  state: GroupState,
  agentId: string
): GroupState {
  const target = groupOf(state.groups, agentId);
  if (!target) return state;
  const newLayout = pruneAgent(target.layout, agentId);
  const nextGroups = updateGroup(state.groups, target.id, newLayout);
  if (target.id !== state.activeGroupId) {
    return { ...state, groups: nextGroups };
  }
  if (!newLayout) {
    return { groups: nextGroups, activeGroupId: null, activePath: null };
  }
  if (state.activePath && getAt(newLayout, state.activePath)) {
    return { ...state, groups: nextGroups };
  }
  return {
    groups: nextGroups,
    activeGroupId: state.activeGroupId,
    activePath: firstLeafPath(newLayout),
  };
}

export function performDrop(
  state: GroupState,
  fromAgentId: string,
  targetLeafId: string,
  zone: DropZone
): GroupState {
  const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
  if (!activeGroup) return state;
  const targetPathInitial = findLeafPathById(activeGroup.layout, targetLeafId);
  if (!targetPathInitial) return state;

  const sourceGroup = groupOf(state.groups, fromAgentId);
  const sourceInActive = sourceGroup?.id === state.activeGroupId;

  if (activeGroup.sessionLocked && !sourceInActive) {
    return state;
  }

  if (preventsOutgoing(sourceGroup, state.activeGroupId)) {
    return state;
  }

  if (sourceInActive) {
    const sourceLeafPath = findLeafPath(activeGroup.layout, fromAgentId);
    if (sourceLeafPath && pathEq(sourceLeafPath, targetPathInitial)) {
      const sourceLeaf = getAt(activeGroup.layout, sourceLeafPath);
      if (
        sourceLeaf &&
        sourceLeaf.type === "leaf" &&
        sourceLeaf.tabs.length === 1
      ) {
        return state;
      }
      if (zone === "center") {
        const lay = setLeafActiveTab(
          activeGroup.layout,
          sourceLeafPath,
          fromAgentId
        );
        return {
          ...state,
          groups: updateGroup(state.groups, state.activeGroupId!, lay),
        };
      }
    }
  }

  let nextGroups = state.groups;

  if (zone === "center") {
    if (sourceInActive) {
      const prunedLayout = pruneAgent(activeGroup.layout, fromAgentId);
      nextGroups = updateGroup(nextGroups, state.activeGroupId!, prunedLayout);
    } else if (sourceGroup) {
      const newSourceLayout = pruneAgent(sourceGroup.layout, fromAgentId);
      nextGroups = updateGroup(nextGroups, sourceGroup.id, newSourceLayout);
    }
    const updatedTarget = nextGroups.find(
      (g) => g.id === state.activeGroupId
    );
    if (!updatedTarget) return state;
    const targetPathAfter = findLeafPathById(
      updatedTarget.layout,
      targetLeafId
    );
    if (!targetPathAfter) return state;
    const newLayout = addTabToLeafAt(
      updatedTarget.layout,
      targetPathAfter,
      fromAgentId
    );
    return {
      groups: updateGroup(nextGroups, state.activeGroupId!, newLayout),
      activeGroupId: state.activeGroupId,
      activePath: targetPathAfter,
    };
  }

  if (sourceInActive) {
    const newActiveLayout = pruneAgent(activeGroup.layout, fromAgentId);
    nextGroups = updateGroup(nextGroups, state.activeGroupId!, newActiveLayout);
  } else if (sourceGroup) {
    const newSourceLayout = pruneAgent(sourceGroup.layout, fromAgentId);
    nextGroups = updateGroup(nextGroups, sourceGroup.id, newSourceLayout);
  }

  const dir: "h" | "v" = zone === "left" || zone === "right" ? "h" : "v";
  const before = zone === "left" || zone === "top";
  return (
    splitIntoPair(
      nextGroups,
      activeGroup.id,
      targetLeafId,
      fromAgentId,
      dir,
      before,
      activeGroup
    ) ?? state
  );
}
