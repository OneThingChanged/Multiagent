import { expect, it, vi } from "vitest";
import { createTerminalHandlers } from "./terminal-handlers.mjs";

it("routes typed terminal lifecycle commands through the session service", async () => {
  const terminalSessions = {
    attach: vi.fn(() => ({ data: "replay" })),
    detach: vi.fn(),
    action: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  };
  const spawnPty = vi.fn(() => ({ reattached: false }));
  const confirmClose = vi.fn(() => true);
  const handlers = createTerminalHandlers({ terminalSessions, spawnPty, confirmClose });
  const event = { sender: { id: 42 } };

  expect(await handlers.invoke(event, "spawn_pty", { id: "a" })).toEqual({ reattached: false });
  expect(handlers.invoke(event, "attach_terminal", { id: "a", afterSequence: 7 })).toEqual({ data: "replay" });
  handlers.invoke(event, "detach_terminal", { id: "a" });
  handlers.invoke(event, "terminal_session_action", { id: "a", action: "sleep" });

  expect(terminalSessions.attach).toHaveBeenCalledWith("a", 42, 7);
  expect(terminalSessions.detach).toHaveBeenCalledWith("a", 42);
  expect(terminalSessions.action).toHaveBeenCalledWith("a", "sleep");
  expect(handlers.invoke(event, "confirm_close", {})).toBe(true);
  expect(confirmClose).toHaveBeenCalledWith(42);
});
