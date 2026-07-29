import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(async () => {
  await import("./terminal-touch.js");
});

afterAll(() => {
  delete globalThis.MultiAgentTerminalTouch;
});

function touch(identifier, clientX, clientY) {
  return { identifier, clientX, clientY };
}

function touchList(...items) {
  return {
    length: items.length,
    item: (index) => items[index] ?? null,
  };
}

function setup(type = "normal", mouseTrackingMode = "none") {
  const listeners = new Map();
  const container = {
    addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
    removeEventListener: vi.fn(),
  };
  const scrollLines = vi.fn();
  const sendRaw = vi.fn();
  const term = {
    rows: 20,
    cols: 80,
    options: { fontSize: 13 },
    buffer: { active: { type } },
    modes: { mouseTrackingMode },
    scrollLines,
    element: {
      querySelector: () => ({
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 800,
          height: 200,
        }),
      }),
    },
  };
  const instance = { term, agentId: "agent-1" };
  const dispose = globalThis.MultiAgentTerminalTouch.install(
    container,
    instance,
    sendRaw
  );
  return { listeners, container, scrollLines, sendRaw, dispose };
}

function fireDrag(listeners, fromY, toY, clientX = 400) {
  const start = touch(7, clientX, fromY);
  listeners.get("touchstart")({
    touches: touchList(start),
  });
  const moved = touch(7, clientX, toY);
  const event = {
    touches: touchList(moved),
    cancelable: true,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
  listeners.get("touchmove")(event);
  return event;
}

describe("Remote terminal touch scroll", () => {
  it("turns a one-finger vertical drag into normal-buffer scrollback", () => {
    const { listeners, scrollLines } = setup();
    const event = fireDrag(listeners, 100, 60);
    expect(scrollLines).toHaveBeenCalledWith(4);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("sends PageUp for an alternate-buffer downward finger drag", () => {
    const { listeners, sendRaw } = setup("alternate");
    fireDrag(listeners, 60, 100);
    expect(sendRaw).toHaveBeenCalledWith("agent-1", "\x1b[5~".repeat(3));
  });

  it("uses SGR wheel events when the alternate buffer tracks the mouse", () => {
    const { listeners, sendRaw } = setup("alternate", "any");
    fireDrag(listeners, 100, 80);
    expect(sendRaw).toHaveBeenCalledWith(
      "agent-1",
      "\x1b[<65;40;8M".repeat(2)
    );
  });

  it("leaves horizontal gestures alone and removes listeners on dispose", () => {
    const { listeners, container, scrollLines, dispose } = setup();
    const start = touch(7, 30, 100);
    listeners.get("touchstart")({ touches: touchList(start) });
    const event = {
      touches: touchList(touch(7, 80, 106)),
      cancelable: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    listeners.get("touchmove")(event);
    expect(scrollLines).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    dispose();
    expect(container.removeEventListener).toHaveBeenCalledTimes(4);
  });
});
