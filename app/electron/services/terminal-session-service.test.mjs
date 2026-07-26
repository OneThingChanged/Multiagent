import { expect, it, vi } from "vitest";
import { PassThroughTerminalFilter } from "./terminal-stream.mjs";
import { TerminalSessionService } from "./terminal-session-service.mjs";

function fakePty() {
  let onData = () => {};
  let onExit = () => {};
  return {
    cols: 80,
    rows: 24,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData(listener) { onData = listener; },
    onExit(listener) { onExit = listener; },
    emitData(data) { onData(data); },
    emitExit(exitCode = 0) { onExit({ exitCode }); },
  };
}

function register(service, id, process = fakePty(), extra = {}) {
  const generation = service.beginSpawn(id);
  const accepted = service.register({
    id,
    process,
    filter: new PassThroughTerminalFilter(),
    ...extra,
  }, generation);
  expect(accepted).toBe(true);
  return process;
}

it("buffers hidden output and replays it only to an attached view", () => {
  const deliveries = [];
  const service = new TerminalSessionService({
    sendDataToView: (viewId, payload) => deliveries.push({ viewId, payload }),
  });
  const pty = register(service, "agent-1");
  pty.emitData("hidden");
  expect(deliveries).toEqual([]);

  expect(service.attach("agent-1", 10, 0)).toMatchObject({
    sequenceStart: 0,
    sequenceEnd: 6,
    data: "hidden",
  });
  pty.emitData(" live");
  expect(deliveries).toEqual([{
    viewId: 10,
    payload: {
      id: "agent-1",
      sequenceStart: 6,
      sequenceEnd: 11,
      data: " live",
    },
  }]);
});

it("moves a view without losing or duplicating output", () => {
  const deliveries = [];
  const service = new TerminalSessionService({
    sendDataToView: (viewId, payload) => deliveries.push({ viewId, payload }),
  });
  const pty = register(service, "agent-1");
  service.attach("agent-1", 1, 0);
  pty.emitData("first");
  service.detach("agent-1", 1);
  pty.emitData("between");
  const replay = service.attach("agent-1", 2, 5);
  pty.emitData("last");

  expect(replay).toMatchObject({ data: "between", sequenceStart: 5, sequenceEnd: 12 });
  expect(deliveries.map(({ viewId, payload }) => [viewId, payload.data])).toEqual([
    [1, "first"],
    [2, "last"],
  ]);
});

it("makes duplicate close idempotent and ignores a late exit", () => {
  const exits = [];
  const released = vi.fn();
  const service = new TerminalSessionService({ broadcastExit: (event) => exits.push(event) });
  const pty = register(service, "agent-1", fakePty(), { release: released });

  expect(service.close("agent-1")).toBe(true);
  expect(service.close("agent-1")).toBe(false);
  pty.emitExit(9);
  expect(pty.kill).toHaveBeenCalledTimes(1);
  expect(released).toHaveBeenCalledTimes(1);
  expect(exits).toEqual([]);
});

it("uses an entry process-tree terminator before the PTY fallback", () => {
  const service = new TerminalSessionService();
  const pty = fakePty();
  const terminate = vi.fn(() => true);
  register(service, "agent-tree", pty, { terminate });

  expect(service.close("agent-tree", "sleep")).toBe(true);
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(pty.kill).not.toHaveBeenCalled();
});

it("falls back to PTY kill when process-tree termination fails", () => {
  const service = new TerminalSessionService();
  const pty = fakePty();
  register(service, "agent-tree", pty, { terminate: () => false });

  expect(service.close("agent-tree", "restart")).toBe(true);
  expect(pty.kill).toHaveBeenCalledTimes(1);
});

it("does not let an in-flight spawn resurrect a session after close", () => {
  const service = new TerminalSessionService();
  const process = fakePty();
  const generation = service.beginSpawn("agent-1");
  service.close("agent-1");

  expect(service.register({
    id: "agent-1",
    process,
    filter: new PassThroughTerminalFilter(),
  }, generation)).toBe(false);
  expect(service.has("agent-1")).toBe(false);
  expect(process.kill).toHaveBeenCalledTimes(1);
});

it("keeps a newer process when the old process exits late", () => {
  const service = new TerminalSessionService();
  const oldProcess = register(service, "agent-1");
  service.close("agent-1", "restart");
  const newProcess = register(service, "agent-1");
  oldProcess.emitExit(1);

  expect(service.get("agent-1")?.process).toBe(newProcess);
});

it("graceful quit writes the provider command and keeps the session alive", () => {
  const service = new TerminalSessionService();
  const pty = register(service, "agent-1", fakePty(), { quitCommand: "/quit\r" });
  expect(service.action("agent-1", "quit")).toBe(true);
  expect(pty.write).toHaveBeenCalledWith("/quit\r");
  expect(pty.kill).not.toHaveBeenCalled();
  expect(service.has("agent-1")).toBe(true);
});

it("reports the live id set for crash-safe reopen journaling", () => {
  const onSessionsChanged = vi.fn();
  const service = new TerminalSessionService({ onSessionsChanged });
  register(service, "agent-1");
  register(service, "agent-2");
  service.close("agent-1", "sleep");

  expect(onSessionsChanged.mock.calls.map(([event]) => event)).toEqual([
    { reason: "spawn", ids: ["agent-1"] },
    { reason: "spawn", ids: ["agent-1", "agent-2"] },
    { reason: "sleep", ids: ["agent-2"] },
  ]);
});
