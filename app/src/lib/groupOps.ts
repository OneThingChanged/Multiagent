import type { DropZone, Group, LayoutNode, Path } from "../types";
import {
  addTabToLeafAt,
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
  splitLeafAt,
  updateGroup,
} from "./layout";

export type GroupState = {
  groups: Group[];
  activeGroupId: string | null;
  activePath: Path | null;
};

function placeIntoSoloGroup(state: GroupState, agentId: string): GroupState {
  const newId = crypto.randomUUID();
  return {
    groups: [...state.groups, { id: newId, layout: makeLeaf(agentId) }],
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

export function selectAgent(state: GroupState, agentId: string): GroupState {
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
  return placeIntoSoloGroup(state, agentId);
}

export function addNewAgent(state: GroupState, agentId: string): GroupState {
  return placeIntoSoloGroup(state, agentId);
}

export function openAsTab(state: GroupState, agentId: string): GroupState {
  const activeGroup = state.groups.find((g) => g.id === state.activeGroupId);
  if (!activeGroup || !state.activePath) {
    return selectAgent(state, agentId);
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
  direction: "h" | "v"
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
    return placeIntoSoloGroup(state, agentId);
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

  let nextGroups = state.groups;
  const source = groupOf(nextGroups, agentId);
  if (preventsOutgoing(source, state.activeGroupId)) {
    return state;
  }
  if (source) {
    const newSourceLayout = pruneAgent(source.layout, agentId);
    nextGroups = updateGroup(nextGroups, source.id, newSourceLayout);
  }

  const targetGroup = nextGroups.find((g) => g.id === state.activeGroupId);
  if (!targetGroup) return state;
  const { layout: newActiveLayout, newPath } = splitLeafAt(
    targetGroup.layout,
    state.activePath,
    direction,
    agentId
  );
  return {
    groups: updateGroup(nextGroups, state.activeGroupId!, newActiveLayout),
    activeGroupId: state.activeGroupId,
    activePath: newPath,
  };
}

export function closeTab(
  state: GroupState,
  path: Path,
  agentId: string
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
    { id: crypto.randomUUID(), layout: makeLeaf(agentId) },
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

  const targetGroup = nextGroups.find((g) => g.id === state.activeGroupId);
  if (!targetGroup) return state;
  const targetPathAfter = findLeafPathById(targetGroup.layout, targetLeafId);
  if (!targetPathAfter) return state;
  const dir: "h" | "v" = zone === "left" || zone === "right" ? "h" : "v";
  const before = zone === "left" || zone === "top";
  const { layout: result, newPath } = insertNextTo(
    targetGroup.layout,
    targetPathAfter,
    makeLeaf(fromAgentId),
    dir,
    before
  );
  return {
    groups: updateGroup(nextGroups, state.activeGroupId!, result),
    activeGroupId: state.activeGroupId,
    activePath: newPath,
  };
}
