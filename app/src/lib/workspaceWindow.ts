import { LS_GROUPS, LS_VIEW } from "../types";

export const DEFAULT_WORKSPACE_WINDOW_ID = "primary";
const MAX_WORKSPACE_WINDOW_ID_LENGTH = 128;

export type WorkspaceWindowContext = {
  id: string;
  restore: boolean;
  resumeLive: boolean;
  groupsKey: string;
  viewKey: string;
};

export function normalizeWorkspaceWindowId(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (
    !trimmed ||
    trimmed.length > MAX_WORKSPACE_WINDOW_ID_LENGTH ||
    !/^[A-Za-z0-9._-]+$/.test(trimmed)
  ) {
    return DEFAULT_WORKSPACE_WINDOW_ID;
  }
  return trimmed;
}

export function workspaceGroupsKey(workspaceWindowId: string) {
  return `multiagent.workspace.${normalizeWorkspaceWindowId(workspaceWindowId)}.groups.v1`;
}

export function workspaceViewKey(workspaceWindowId: string) {
  return `multiagent.workspace.${normalizeWorkspaceWindowId(workspaceWindowId)}.view.v1`;
}

export function workspaceWindowContext(
  search: string | undefined =
    typeof location === "undefined" ? undefined : location.search
): WorkspaceWindowContext {
  const params = new URLSearchParams(search ?? "");
  const id = normalizeWorkspaceWindowId(params.get("workspaceWindowId"));
  // Entry URLs without a workspace id map to the primary workspace so existing
  // layouts migrate once.
  const restore =
    !params.has("workspaceWindowId") || params.get("restoreWorkspace") === "1";
  return {
    id,
    restore,
    resumeLive: params.get("resumeWorkspace") === "1",
    groupsKey: workspaceGroupsKey(id),
    viewKey: workspaceViewKey(id),
  };
}

export function migrateLegacyWorkspaceStorage(
  context: WorkspaceWindowContext
) {
  if (!context.restore) return;
  try {
    if (!localStorage.getItem(context.groupsKey)) {
      const groups = localStorage.getItem(LS_GROUPS);
      if (groups) localStorage.setItem(context.groupsKey, groups);
    }
    if (!localStorage.getItem(context.viewKey)) {
      const view = localStorage.getItem(LS_VIEW);
      if (view) localStorage.setItem(context.viewKey, view);
    }
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
}
