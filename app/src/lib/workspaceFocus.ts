import type { GroupState } from "./groupOps";
import { activeAgentInLeaf, getAt } from "./layout";

export type FocusTarget = {
  focus: () => void;
};

export function activeAgentIdForGroupState(state: GroupState): string | null {
  if (!state.activeGroupId || !state.activePath) return null;
  const group = state.groups.find(
    (candidate) => candidate.id === state.activeGroupId
  );
  if (!group) return null;
  const leaf = getAt(group.layout, state.activePath);
  return leaf && leaf.type === "leaf" ? activeAgentInLeaf(leaf) : null;
}

export function scheduleActiveTerminalFocus({
  getState,
  getTarget,
  requestFrame,
  cancelFrame,
  maxAttempts = 4,
}: {
  getState: () => GroupState;
  getTarget: (agentId: string) => FocusTarget | null | undefined;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  maxAttempts?: number;
}) {
  let cancelled = false;
  let frameHandle: number | null = null;
  let attempts = 0;

  const tryFocus = () => {
    if (cancelled) return;
    attempts += 1;
    const agentId = activeAgentIdForGroupState(getState());
    const target = agentId ? getTarget(agentId) : null;
    if (target) {
      target.focus();
      return;
    }
    if (attempts < maxAttempts) {
      frameHandle = requestFrame(tryFocus);
    }
  };

  frameHandle = requestFrame(tryFocus);
  return () => {
    cancelled = true;
    if (frameHandle !== null) cancelFrame(frameHandle);
  };
}
