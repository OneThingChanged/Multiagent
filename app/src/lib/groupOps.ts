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

export type ClosedTabHistoryEntry = {
  agentId: string;
  sourceGroup: Group;
  sourceGroupIndex: number;
  sourcePath: Path;
  sourceLeafId: string;
  sourceTabIndex: number;
  sourceAfterClose: Group | null;
  detachedGroup: Group;
  closedAt: number;
};

export type CloseTabResult = {
  state: GroupState;
  closed: ClosedTabHistoryEntry | null;
};

export type ReopenClosedTabResult = {
  state: GroupState;
  restored: boolean;
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

export function selectGroup(
  state: GroupState,
  groupId: string,
  preferredAgentId?: string
): GroupState {
  const group = state.groups.find((candidate) => candidate.id === groupId);
  if (!group) return state;

  const preferredPath = preferredAgentId
    ? findLeafPath(group.layout, preferredAgentId)
    : null;
  const path =
    preferredPath ??
    (state.activeGroupId === groupId &&
    state.activePath &&
    getAt(group.layout, state.activePath)
      ? state.activePath
      : firstLeafPath(group.layout));
  if (!path) return state;

  const layout = preferredAgentId
    ? setLeafActiveTab(group.layout, path, preferredAgentId)
    : group.layout;
  return {
    groups: updateGroup(state.groups, groupId, layout),
    activeGroupId: groupId,
    activePath: path,
  };
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

  const target = nextGroups.find((group) => group.id === activeGroup.id);
  if (!target) return state;
  const targetPath = findLeafPathById(target.layout, activeLeaf.id);
  if (!targetPath) return state;
  const { layout, newPath } = insertNextTo(
    target.layout,
    targetPath,
    makeLeaf(agentId),
    direction,
    false
  );
  if (!layout) return state;
  return {
    groups: updateGroup(nextGroups, activeGroup.id, layout),
    activeGroupId: activeGroup.id,
    activePath: newPath,
  };
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

export function closeTabWithHistory(
  state: GroupState,
  path: Path,
  agentId: string,
  projectId?: string
): CloseTabResult {
  const sourceGroupIndex = state.groups.findIndex(
    (group) => group.id === state.activeGroupId
  );
  const sourceGroup = state.groups[sourceGroupIndex];
  const sourceLeaf = sourceGroup ? getAt(sourceGroup.layout, path) : null;
  if (
    !sourceGroup ||
    !sourceLeaf ||
    sourceLeaf.type !== "leaf" ||
    !sourceLeaf.tabs.includes(agentId)
  ) {
    return { state, closed: null };
  }

  const sourceTabIndex = sourceLeaf.tabs.indexOf(agentId);
  const next = closeTab(state, path, agentId, projectId);
  if (next === state) return { state, closed: null };

  const detachedGroup = groupOf(next.groups, agentId);
  if (!detachedGroup) return { state, closed: null };

  return {
    state: next,
    closed: {
      agentId,
      sourceGroup,
      sourceGroupIndex,
      sourcePath: [...path],
      sourceLeafId: sourceLeaf.id,
      sourceTabIndex,
      sourceAfterClose:
        next.groups.find((group) => group.id === sourceGroup.id) ?? null,
      detachedGroup,
      closedAt: Date.now(),
    },
  };
}

function sameGroupSnapshot(left: Group | null, right: Group | null) {
  if (!left || !right) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function removeAgentFromGroups(groups: Group[], agentId: string) {
  const next: Group[] = [];
  for (const group of groups) {
    const layout = pruneAgent(group.layout, agentId);
    if (!layout) continue;
    next.push(updateGroup([group], group.id, layout)[0]);
  }
  return next;
}

function insertTabAt(
  layout: LayoutNode,
  path: Path,
  agentId: string,
  requestedIndex: number
) {
  const leaf = getAt(layout, path);
  if (!leaf || leaf.type !== "leaf") return layout;
  const tabs = leaf.tabs.filter((tabId) => tabId !== agentId);
  const index = Math.max(0, Math.min(requestedIndex, tabs.length));
  tabs.splice(index, 0, agentId);
  return setAt(layout, path, { ...leaf, tabs, activeIndex: index }) ?? layout;
}

function restoreGroupPin(group: Group, source: Group, agentId: string): Group {
  const sessionId = source.sessionPins?.[agentId]?.trim();
  if (!sessionId) return group;
  return {
    ...group,
    sessionPins: { ...(group.sessionPins ?? {}), [agentId]: sessionId },
    sessionLocked: source.sessionLocked || group.sessionLocked ? true : undefined,
  };
}

export function reopenClosedTab(
  state: GroupState,
  closed: ClosedTabHistoryEntry
): ReopenClosedTabResult {
  const currentSource = state.groups.find(
    (group) => group.id === closed.sourceGroup.id
  ) ?? null;
  const alreadyRestoredPath = currentSource
    ? findLeafPath(currentSource.layout, closed.agentId)
    : null;
  if (currentSource && alreadyRestoredPath) {
    return {
      restored: true,
      state: {
        groups: updateGroup(
          state.groups,
          currentSource.id,
          setLeafActiveTab(
            currentSource.layout,
            alreadyRestoredPath,
            closed.agentId
          )
        ),
        activeGroupId: currentSource.id,
        activePath: alreadyRestoredPath,
      },
    };
  }

  const currentDetached = state.groups.find(
    (group) => group.id === closed.detachedGroup.id
  ) ?? null;
  const sourceUnchanged = sameGroupSnapshot(
    currentSource,
    closed.sourceAfterClose
  );
  const detachedUnchanged = sameGroupSnapshot(
    currentDetached,
    closed.detachedGroup
  );
  const groupsWithoutAgent = removeAgentFromGroups(
    state.groups,
    closed.agentId
  );

  if (sourceUnchanged && detachedUnchanged) {
    const restoredPath =
      findLeafPath(closed.sourceGroup.layout, closed.agentId) ??
      closed.sourcePath;
    const restoredSource = {
      ...closed.sourceGroup,
      layout: setLeafActiveTab(
        closed.sourceGroup.layout,
        restoredPath,
        closed.agentId
      ) ?? closed.sourceGroup.layout,
    };
    const withoutSource = groupsWithoutAgent.filter(
      (group) => group.id !== closed.sourceGroup.id
    );
    const insertIndex = Math.max(
      0,
      Math.min(closed.sourceGroupIndex, withoutSource.length)
    );
    const groups = [...withoutSource];
    groups.splice(insertIndex, 0, restoredSource);
    return {
      restored: true,
      state: {
        groups,
        activeGroupId: closed.sourceGroup.id,
        activePath: restoredPath,
      },
    };
  }

  const target = groupsWithoutAgent.find(
    (group) => group.id === closed.sourceGroup.id
  );
  if (target) {
    const targetPath =
      findLeafPathById(target.layout, closed.sourceLeafId) ??
      (getAt(target.layout, closed.sourcePath)?.type === "leaf"
        ? closed.sourcePath
        : firstLeafPath(target.layout));
    if (!targetPath) return { state, restored: false };
    const layout = insertTabAt(
      target.layout,
      targetPath,
      closed.agentId,
      closed.sourceTabIndex
    );
    const restoredTarget = restoreGroupPin(
      { ...target, layout },
      closed.sourceGroup,
      closed.agentId
    );
    return {
      restored: true,
      state: {
        groups: groupsWithoutAgent.map((group) =>
          group.id === target.id ? restoredTarget : group
        ),
        activeGroupId: target.id,
        activePath: targetPath,
      },
    };
  }

  if (collectAgentIds(closed.sourceGroup.layout).size !== 1) {
    return { state, restored: false };
  }
  const insertIndex = Math.max(
    0,
    Math.min(closed.sourceGroupIndex, groupsWithoutAgent.length)
  );
  const groups = [...groupsWithoutAgent];
  groups.splice(insertIndex, 0, closed.sourceGroup);
  return {
    restored: true,
    state: {
      groups,
      activeGroupId: closed.sourceGroup.id,
      activePath: closed.sourcePath,
    },
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
  const updatedTarget = nextGroups.find(
    (group) => group.id === activeGroup.id
  );
  if (!updatedTarget) return state;
  const targetPathAfter = findLeafPathById(
    updatedTarget.layout,
    targetLeafId
  );
  if (!targetPathAfter) return state;
  const { layout, newPath } = insertNextTo(
    updatedTarget.layout,
    targetPathAfter,
    makeLeaf(fromAgentId),
    dir,
    before
  );
  if (!layout) return state;
  return {
    groups: updateGroup(nextGroups, activeGroup.id, layout),
    activeGroupId: activeGroup.id,
    activePath: newPath,
  };
}
