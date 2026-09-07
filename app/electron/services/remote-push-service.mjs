import fs from "node:fs";
import path from "node:path";
import webPush from "web-push";

const MAX_SUBSCRIPTIONS = 64;
const MAX_ENDPOINT_LENGTH = 4096;
const MAX_KEY_LENGTH = 1024;
const EVENT_DEDUPE_MS = 5_000;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeLogin(value) {
  return clean(value).toLowerCase();
}

export function normalizePushSubscription(value) {
  const endpoint = clean(value?.endpoint);
  const p256dh = clean(value?.keys?.p256dh);
  const auth = clean(value?.keys?.auth);
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new TypeError("invalid push endpoint");
  }
  if (
    parsed.protocol !== "https:" ||
    endpoint.length > MAX_ENDPOINT_LENGTH ||
    !p256dh ||
    p256dh.length > MAX_KEY_LENGTH ||
    !auth ||
    auth.length > MAX_KEY_LENGTH
  ) {
    throw new TypeError("invalid push subscription");
  }
  return { endpoint, keys: { p256dh, auth } };
}

function validVapidKeys(value) {
  return Boolean(clean(value?.publicKey) && clean(value?.privateKey));
}

export class RemotePushService {
  constructor({
    baseDir,
    webPushImpl = webPush,
    now = () => Date.now(),
  }) {
    this.file = path.join(baseDir, "remote-push.json");
    this.webPush = webPushImpl;
    this.now = now;
    this.recentEvents = new Map();
    this.vapid = null;
    this.subscriptions = [];
    this.load();
  }

  load() {
    let stored = null;
    try {
      stored = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {}
    this.vapid = validVapidKeys(stored?.vapid)
      ? stored.vapid
      : this.webPush.generateVAPIDKeys();
    this.subscriptions = Array.isArray(stored?.subscriptions)
      ? stored.subscriptions.flatMap((entry) => {
          try {
            const subscription = normalizePushSubscription(entry);
            const login = normalizeLogin(entry.login);
            if (!login) return [];
            return [{
              login,
              ...subscription,
              createdAt: Number(entry.createdAt) || this.now(),
              updatedAt: Number(entry.updatedAt) || this.now(),
            }];
          } catch {
            return [];
          }
        }).slice(-MAX_SUBSCRIPTIONS)
      : [];
    this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(
      temporary,
      JSON.stringify({
        version: 3,
        vapid: this.vapid,
        subscriptions: this.subscriptions,
      }, null, 2),
      { encoding: "utf8", mode: 0o600 },
    );
    fs.renameSync(temporary, this.file);
  }

  publicKey() {
    return this.vapid.publicKey;
  }

  subscribe(loginValue, value) {
    const login = normalizeLogin(loginValue);
    if (!login) throw new TypeError("login required");
    const subscription = normalizePushSubscription(value);
    const existing = this.subscriptions.find((entry) => entry.endpoint === subscription.endpoint);
    const now = this.now();
    if (existing) {
      existing.login = login;
      existing.keys = subscription.keys;
      existing.updatedAt = now;
    } else {
      this.subscriptions.push({ login, ...subscription, createdAt: now, updatedAt: now });
      if (this.subscriptions.length > MAX_SUBSCRIPTIONS) {
        this.subscriptions.splice(0, this.subscriptions.length - MAX_SUBSCRIPTIONS);
      }
    }
    this.save();
    return { subscribed: true };
  }

  unsubscribe(loginValue, endpointValue) {
    const login = normalizeLogin(loginValue);
    const endpoint = clean(endpointValue);
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter(
      (entry) => entry.login !== login || entry.endpoint !== endpoint,
    );
    if (this.subscriptions.length !== before) this.save();
    return { subscribed: false };
  }

  removeLogin(loginValue) {
    const login = normalizeLogin(loginValue);
    if (!login) return;
    const before = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter((entry) => entry.login !== login);
    if (this.subscriptions.length !== before) this.save();
  }

  async notifyDone({ agentId, sessionId, title }) {
    return this.notifyEvent({
      type: "agent-done",
      agentId,
      sessionId,
      title,
      urgency: "normal",
    });
  }

  async notifyQuestion({ agentId, sessionId, title }) {
    return this.notifyEvent({
      type: "agent-question",
      agentId,
      sessionId,
      title,
      urgency: "high",
    });
  }

  async notifyEvent({ type, agentId, sessionId, title, urgency }) {
    const id = clean(agentId);
    if (!id || this.subscriptions.length === 0) {
      return { sent: 0, removed: 0, duplicate: false };
    }
    const now = this.now();
    const eventKey = `${clean(type)}:${id}`;
    const previous = this.recentEvents.get(eventKey);
    if (
      previous &&
      previous.sessionId === clean(sessionId) &&
      now - previous.at < EVENT_DEDUPE_MS
    ) {
      return { sent: 0, removed: 0, duplicate: true };
    }
    this.recentEvents.set(eventKey, { sessionId: clean(sessionId), at: now });
    for (const [key, value] of this.recentEvents) {
      if (now - value.at > 60_000) this.recentEvents.delete(key);
    }

    const safeType = type === "agent-question" ? "agent-question" : "agent-done";
    const safeBody = safeType === "agent-question"
      ? "응답이 필요합니다."
      : "작업이 완료되었습니다.";
    const notification = {
      type: safeType,
      title: (clean(title) || "Acedia").slice(0, 120),
      // Never put prompts, terminal output, file paths, or tool input on a lock screen.
      body: safeBody,
      tag: `${safeType === "agent-question" ? "question" : "done"}:${id}`,
      agentId: id,
      url: `/?agent=${encodeURIComponent(id)}`,
      timestamp: now,
    };
    const payload = JSON.stringify(notification);
    const expiredWeb = new Set();
    let webSent = 0;
    await Promise.all(this.subscriptions.map(async (entry) => {
      try {
        await this.webPush.sendNotification(
          { endpoint: entry.endpoint, keys: entry.keys },
          payload,
          {
            TTL: 60 * 60,
            urgency,
            vapidDetails: {
              subject: "mailto:multiagent@localhost",
              publicKey: this.vapid.publicKey,
              privateKey: this.vapid.privateKey,
            },
          },
        );
        webSent += 1;
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          expiredWeb.add(entry.endpoint);
        }
      }
    }));

    if (expiredWeb.size > 0) {
      this.subscriptions = this.subscriptions.filter((entry) => !expiredWeb.has(entry.endpoint));
      this.save();
    }
    return {
      sent: webSent,
      removed: expiredWeb.size,
      duplicate: false,
    };
  }
}
