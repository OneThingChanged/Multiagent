import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_DEVICES = 32;
const MAX_DEVICES_PER_LOGIN = 4;
const MAX_EVENTS = 128;
const MAX_WAITERS = 64;
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 25_000;
const EVENT_DEDUPE_MS = 5_000;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeLogin(value) {
  return clean(value).toLowerCase();
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(clean(token), "utf8").digest("hex");
}

function validStoredDevice(value, now) {
  return Boolean(
    clean(value?.id) &&
    normalizeLogin(value?.login) &&
    /^[a-f0-9]{64}$/.test(clean(value?.tokenHash)) &&
    Number(value?.expiresAt) > now,
  );
}

export class RemoteDeviceMonitorService {
  constructor({ baseDir, now = () => Date.now(), pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS }) {
    this.file = path.join(baseDir, "remote-monitor-devices.json");
    this.now = now;
    this.pollTimeoutMs = pollTimeoutMs;
    this.devices = [];
    this.events = [];
    this.recentEvents = new Map();
    this.waiters = new Set();
    this.cursor = this.now() * 1_000;
    this.load();
  }

  load() {
    let stored = null;
    try {
      stored = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {}
    const now = this.now();
    this.devices = Array.isArray(stored?.devices)
      ? stored.devices.filter((entry) => validStoredDevice(entry, now)).slice(-MAX_DEVICES)
      : [];
    if (this.devices.length > 0 || stored) this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({
      version: 1,
      devices: this.devices,
    }, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  prune() {
    const now = this.now();
    const before = this.devices.length;
    this.devices = this.devices.filter((entry) => Number(entry.expiresAt) > now);
    if (this.devices.length !== before) this.save();
  }

  issue(loginValue) {
    const login = normalizeLogin(loginValue);
    if (!login) throw new TypeError("login required");
    this.prune();
    const token = `ma1_${crypto.randomBytes(32).toString("base64url")}`;
    const now = this.now();
    const device = {
      id: crypto.randomUUID(),
      login,
      tokenHash: tokenHash(token),
      createdAt: now,
      updatedAt: now,
      expiresAt: now + TOKEN_TTL_MS,
    };
    const sameLogin = this.devices.filter((entry) => entry.login === login);
    if (sameLogin.length >= MAX_DEVICES_PER_LOGIN) {
      const remove = new Set(sameLogin
        .sort((a, b) => Number(a.updatedAt) - Number(b.updatedAt))
        .slice(0, sameLogin.length - MAX_DEVICES_PER_LOGIN + 1)
        .map((entry) => entry.id));
      this.devices = this.devices.filter((entry) => !remove.has(entry.id));
    }
    this.devices.push(device);
    if (this.devices.length > MAX_DEVICES) {
      this.devices.splice(0, this.devices.length - MAX_DEVICES);
    }
    this.save();
    return {
      token,
      deviceId: device.id,
      cursor: this.cursor,
      expiresAt: device.expiresAt,
    };
  }

  authenticate(tokenValue) {
    const token = clean(tokenValue);
    if (!/^ma1_[A-Za-z0-9_-]{43}$/.test(token)) return null;
    this.prune();
    const expected = Buffer.from(tokenHash(token), "hex");
    const device = this.devices.find((entry) => {
      const stored = Buffer.from(entry.tokenHash, "hex");
      return stored.length === expected.length && crypto.timingSafeEqual(stored, expected);
    }) ?? null;
    if (device) device.updatedAt = this.now();
    return device;
  }

  revoke(tokenValue) {
    const hash = tokenHash(tokenValue);
    const before = this.devices.length;
    this.devices = this.devices.filter((entry) => entry.tokenHash !== hash);
    if (this.devices.length !== before) this.save();
    return { revoked: this.devices.length !== before };
  }

  removeLogin(loginValue) {
    const login = normalizeLogin(loginValue);
    if (!login) return;
    const before = this.devices.length;
    this.devices = this.devices.filter((entry) => entry.login !== login);
    if (this.devices.length !== before) this.save();
  }

  publish({ type, agentId, sessionId, title }) {
    const id = clean(agentId);
    if (!id) return null;
    const safeType = type === "agent-question" ? "agent-question" : "agent-done";
    const now = this.now();
    const eventKey = `${safeType}:${id}`;
    const previous = this.recentEvents.get(eventKey);
    if (
      previous &&
      previous.sessionId === clean(sessionId) &&
      now - previous.at < EVENT_DEDUPE_MS
    ) return null;
    this.recentEvents.set(eventKey, { sessionId: clean(sessionId), at: now });
    for (const [key, value] of this.recentEvents) {
      if (now - value.at > 60_000) this.recentEvents.delete(key);
    }
    const event = {
      id: ++this.cursor,
      type: safeType,
      agentId: id.slice(0, 128),
      title: (clean(title) || "Acedia").slice(0, 120),
      body: safeType === "agent-question" ? "응답이 필요합니다." : "작업이 완료되었습니다.",
      createdAt: now,
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    for (const wake of this.waiters) wake();
    this.waiters.clear();
    return event;
  }

  eventsAfter(cursorValue) {
    const cursor = Number.isFinite(Number(cursorValue)) ? Number(cursorValue) : this.cursor;
    const events = this.events.filter((entry) => entry.id > cursor);
    return { cursor: events.at(-1)?.id ?? Math.max(cursor, this.cursor), events };
  }

  async poll(tokenValue, cursorValue, signal) {
    const device = this.authenticate(tokenValue);
    if (!device) {
      const error = new Error("invalid or expired device token");
      error.statusCode = 401;
      throw error;
    }
    let result = this.eventsAfter(cursorValue);
    if (result.events.length > 0 || signal?.aborted) return result;
    if (this.waiters.size >= MAX_WAITERS) {
      const error = new Error("too many monitor connections");
      error.statusCode = 429;
      throw error;
    }
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", finish);
        this.waiters.delete(finish);
        resolve();
      };
      const timer = setTimeout(finish, this.pollTimeoutMs);
      this.waiters.add(finish);
      signal?.addEventListener("abort", finish, { once: true });
    });
    result = this.eventsAfter(cursorValue);
    return result;
  }

  close() {
    for (const wake of this.waiters) wake();
    this.waiters.clear();
  }
}
