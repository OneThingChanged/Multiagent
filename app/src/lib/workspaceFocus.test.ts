import { describe, expect, it, vi } from "vitest";
import type { GroupState } from "./groupOps";
import {
  activeAgentIdForGroupState,
  scheduleActiveTerminalFocus,
} from "./workspaceFocus";

const state: GroupState = {
  groups: [
    {
      id: "group-1",
      layout: {
        type: "leaf",
        id: "leaf-1",
        tabs: ["survivor"],
        activeIndex: 0,
      },
    },
  ],
  activeGroupId: "group-1",
  activePath: [],
};

describe("workspace focus recovery", () => {
  it("does not steal focus when a form or modal opens during recovery", () => {
    const queued: FrameRequestCallback[] = [];
    const focus = vi.fn();
    let formOpen = false;
    let mounted = false;
    scheduleActiveTerminalFocus({
      getState: () => state,
      getTarget: () => mounted ? { focus } : null,
      shouldFocus: () => !formOpen,
      requestFrame: (callback) => queued.push(callback),
      cancelFrame: vi.fn(),
    });
    queued.shift()?.(0);
    formOpen = true;
    mounted = true;
    queued.shift()?.(16);
    expect(focus).not.toHaveBeenCalled();
    expect(queued).toHaveLength(0);
  });

  it("resolves the surviving active terminal from committed group state", () => {
    expect(activeAgentIdForGroupState(state)).toBe("survivor");
  });

  it("retries until the surviving terminal has mounted, then restores focus", () => {
    const queued: FrameRequestCallback[] = [];
    const focus = vi.fn();
    let lookupCount = 0;

    scheduleActiveTerminalFocus({
      getState: () => state,
      getTarget: () => (++lookupCount < 2 ? null : { focus }),
      requestFrame: (callback) => {
        queued.push(callback);
        return queued.length;
      },
      cancelFrame: vi.fn(),
    });

    queued.shift()?.(0);
    expect(focus).not.toHaveBeenCalled();
    queued.shift()?.(16);
    expect(focus).toHaveBeenCalledOnce();
  });
});
