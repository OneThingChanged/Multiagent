import { SequencedTerminalBuffer } from "./terminal-stream.mjs";

const TERMINATING_ACTIONS = new Set(["sleep", "close", "restart"]);

/**
 * Owns PTY processes and their bounded output models independently from any
 * xterm renderer. Views subscribe while visible and replay from a sequence
 * cursor when they attach again.
 */
export class TerminalSessionService {
  constructor({ sendDataToView, broadcastExit, sessions } = {}) {
    this.sessions = sessions ?? new Map();
    this.generations = new Map();
    this.sendDataToView = sendDataToView ?? (() => {});
    this.broadcastExit = broadcastExit ?? (() => {});
  }

  beginSpawn(id) {
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    return generation;
  }

  has(id) {
    return this.sessions.has(id);
  }

  get(id) {
    return this.sessions.get(id);
  }

  values() {
    return this.sessions.values();
  }

  keys() {
    return this.sessions.keys();
  }

  register(rawEntry, generation) {
    const id = rawEntry.id;
    const entry = rawEntry;
    entry.buffer = rawEntry.buffer ?? new SequencedTerminalBuffer();
    entry.subscribers = new Set();
    entry.released = false;

    if (this.generations.get(id) !== generation || this.sessions.has(id)) {
      this.#release(entry, true);
      return false;
    }

    this.sessions.set(id, entry);
    entry.process.onData((data) => {
      if (this.sessions.get(id) !== entry) return;
      entry.onRawData?.(data);
      const visibleData = entry.filter.push(data);
      this.#publish(entry, visibleData);
    });
    entry.process.onExit(({ exitCode }) => {
      if (this.sessions.get(id) !== entry) return;
      this.#publish(entry, entry.filter.finish());
      this.sessions.delete(id);
      this.#release(entry, false);
      this.broadcastExit({ id, exitCode, reason: "natural" });
    });
    return true;
  }

  attach(id, viewId, afterSequence = 0) {
    const entry = this.sessions.get(id);
    if (!entry) throw new Error("활성 PTY를 찾을 수 없습니다.");
    entry.subscribers.add(viewId);
    return entry.buffer.readSince(afterSequence);
  }

  detach(id, viewId) {
    this.sessions.get(id)?.subscribers.delete(viewId);
  }

  detachView(viewId) {
    for (const entry of this.sessions.values()) {
      entry.subscribers.delete(viewId);
    }
  }

  write(id, data) {
    const entry = this.sessions.get(id);
    if (!entry) throw new Error("활성 PTY를 찾을 수 없습니다.");
    const value = String(data ?? "");
    entry.process.write(value);
  }

  resize(id, cols, rows) {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    entry.process.resize(cols, rows);
    return true;
  }

  action(id, action) {
    if (action === "quit") {
      const entry = this.sessions.get(id);
      if (!entry) return false;
      entry.process.write(entry.quitCommand ?? "/quit\r");
      return true;
    }
    if (!TERMINATING_ACTIONS.has(action)) {
      throw new Error(`지원하지 않는 터미널 세션 동작: ${action}`);
    }
    return this.close(id, action);
  }

  close(id, reason = "close") {
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    const entry = this.sessions.get(id);
    if (!entry) return false;
    this.sessions.delete(id);
    entry.closeReason = reason;
    this.#release(entry, true);
    return true;
  }

  closeAll(reason = "app-quit") {
    for (const id of [...this.sessions.keys()]) this.close(id, reason);
  }

  #publish(entry, data) {
    if (!data) return;
    const segment = entry.buffer.append(data);
    for (const viewId of entry.subscribers) {
      this.sendDataToView(viewId, { id: entry.id, ...segment });
    }
  }

  #release(entry, killProcess) {
    if (entry.released) return;
    entry.released = true;
    if (entry.initTimer) {
      clearTimeout(entry.initTimer);
      entry.initTimer = null;
    }
    entry.release?.();
    if (!killProcess) return;
    try {
      if (entry.terminate?.() === true) return;
    } catch {
      // Fall through to the PTY kill when tree termination is unavailable.
    }
    try {
      entry.process.kill();
    } catch {
      // The child may already have exited.
    }
  }
}
