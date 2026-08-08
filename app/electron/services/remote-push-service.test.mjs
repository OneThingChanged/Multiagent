import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeNativePushSubscription,
  normalizePushSubscription,
  RemotePushService,
} from "./remote-push-service.mjs";

const roots = [];
afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-push-"));
  roots.push(root);
  return root;
}

function subscription(endpoint = "https://push.example.test/device-1") {
  return { endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } };
}

describe("RemotePushService", () => {
  it("validates HTTPS push subscriptions", () => {
    expect(normalizePushSubscription(subscription())).toEqual(subscription());
    expect(() => normalizePushSubscription({ endpoint: "http://example.test", keys: {} }))
      .toThrow("invalid push subscription");
  });

  it("accepts only Expo native push tokens and known platforms", () => {
    const value = { token: "ExponentPushToken[device_token_12345]", platform: "Android" };
    expect(normalizeNativePushSubscription(value)).toEqual({
      token: value.token,
      platform: "android",
    });
    expect(() => normalizeNativePushSubscription({ token: "fcm-secret", platform: "android" }))
      .toThrow("invalid native push subscription");
    expect(() => normalizeNativePushSubscription({ token: value.token, platform: "windows" }))
      .toThrow("invalid native push subscription");
  });

  it("persists VAPID keys and subscriptions without exposing the private key", () => {
    const root = createRoot();
    const webPushImpl = {
      generateVAPIDKeys: () => ({ publicKey: "public-vapid", privateKey: "private-vapid" }),
      sendNotification: async () => {},
    };
    const first = new RemotePushService({ baseDir: root, webPushImpl, now: () => 100 });
    first.subscribe("Owner", subscription());
    first.subscribeNative("Owner", {
      token: "ExponentPushToken[device_token_12345]",
      platform: "android",
    });

    const second = new RemotePushService({ baseDir: root, webPushImpl, now: () => 200 });
    expect(second.publicKey()).toBe("public-vapid");
    expect(second.subscriptions).toHaveLength(1);
    expect(second.subscriptions[0]).toMatchObject({ login: "owner", ...subscription() });
    expect(second.nativeSubscriptions).toEqual([
      expect.objectContaining({
        login: "owner",
        token: "ExponentPushToken[device_token_12345]",
        platform: "android",
      }),
    ]);
    expect(second.publicKey()).not.toContain("private");
  });

  it("sends completion pushes, deduplicates hook bursts, and prunes expired endpoints", async () => {
    const root = createRoot();
    let now = 1_000;
    const sent = [];
    const webPushImpl = {
      generateVAPIDKeys: () => ({ publicKey: "public-vapid", privateKey: "private-vapid" }),
      async sendNotification(target, payload, options) {
        sent.push({ target, payload: JSON.parse(payload), options });
        if (target.endpoint.endsWith("expired")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      },
    };
    const service = new RemotePushService({ baseDir: root, webPushImpl, now: () => now });
    service.subscribe("owner", subscription());
    service.subscribe("owner", subscription("https://push.example.test/expired"));

    const result = await service.notifyDone({
      agentId: "agent-1",
      sessionId: "session-1",
      title: "ProjectA / Build",
    });
    expect(result).toEqual({
      sent: 1,
      webSent: 1,
      nativeSent: 0,
      removed: 1,
      duplicate: false,
    });
    expect(sent[0].payload).toMatchObject({
      type: "agent-done",
      title: "ProjectA / Build",
      agentId: "agent-1",
      url: "/?agent=agent-1",
    });
    expect(sent[0].options.vapidDetails.privateKey).toBe("private-vapid");
    expect(service.subscriptions).toHaveLength(1);

    now += 1_000;
    expect(await service.notifyDone({ agentId: "agent-1", sessionId: "session-1" }))
      .toEqual({
        sent: 0,
        webSent: 0,
        nativeSent: 0,
        removed: 0,
        duplicate: true,
      });
  });

  it("sends privacy-safe native completion and question pushes and removes invalid devices", async () => {
    const root = createRoot();
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url, options, messages: JSON.parse(options.body) });
      return {
        ok: true,
        async json() {
          return {
            data: [
              { status: "ok", id: "ticket-1" },
              { status: "error", details: { error: "DeviceNotRegistered" } },
            ],
          };
        },
      };
    };
    const webPushImpl = {
      generateVAPIDKeys: () => ({ publicKey: "public-vapid", privateKey: "private-vapid" }),
      sendNotification: async () => {},
    };
    const service = new RemotePushService({
      baseDir: root,
      webPushImpl,
      fetchImpl,
      expoAccessToken: "local-expo-access-token",
      now: () => 2_000,
    });
    service.subscribeNative("owner", { token: "ExponentPushToken[device_token_12345]", platform: "android" });
    service.subscribeNative("owner", { token: "ExpoPushToken[expired_device_12345]", platform: "android" });

    const result = await service.notifyQuestion({
      agentId: "agent-1",
      sessionId: "session-1",
      title: "ProjectA / Build",
      body: "SECRET prompt and terminal output",
    });

    expect(result).toEqual({
      sent: 1,
      webSent: 0,
      nativeSent: 1,
      removed: 1,
      duplicate: false,
    });
    expect(requests[0].url).toBe("https://exp.host/--/api/v2/push/send");
    expect(requests[0].options.headers.authorization).toBe("Bearer local-expo-access-token");
    expect(requests[0].messages[0]).toMatchObject({
      title: "ProjectA / Build",
      body: "응답이 필요합니다.",
      channelId: "multiagent-agent-events",
      data: { type: "agent-question", agentId: "agent-1", url: "/?agent=agent-1" },
    });
    expect(JSON.stringify(requests[0].messages)).not.toContain("SECRET");
    expect(service.nativeSubscriptions).toHaveLength(1);
  });
});
