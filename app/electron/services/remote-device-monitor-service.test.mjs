import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RemoteDeviceMonitorService } from "./remote-device-monitor-service.mjs";

const roots = [];
afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function createService(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-device-monitor-"));
  roots.push(root);
  return {
    root,
    service: new RemoteDeviceMonitorService({ baseDir: root, pollTimeoutMs: 5, ...options }),
  };
}

describe("RemoteDeviceMonitorService", () => {
  it("stores only token hashes and restores approved devices", () => {
    const { root, service } = createService({ now: () => 1_000 });
    const issued = service.issue("Owner");
    const stored = fs.readFileSync(path.join(root, "remote-monitor-devices.json"), "utf8");

    expect(issued.token).toMatch(/^ma1_[A-Za-z0-9_-]{43}$/);
    expect(stored).not.toContain(issued.token);
    expect(service.authenticate(issued.token)).toMatchObject({ login: "owner" });

    const restored = new RemoteDeviceMonitorService({ baseDir: root, now: () => 2_000 });
    expect(restored.authenticate(issued.token)).toMatchObject({ login: "owner" });
    expect(restored.authenticate("ma1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBeNull();
  });

  it("long-polls privacy-safe completion events and advances the cursor", async () => {
    const { service } = createService({ now: () => 5_000 });
    const issued = service.issue("owner");
    const pending = service.poll(issued.token, issued.cursor);
    service.publish({
      type: "agent-question",
      agentId: "agent-1",
      sessionId: "session-1",
      title: "ProjectA / Build",
      body: "SECRET terminal output",
    });
    const result = await pending;

    expect(result.events).toEqual([expect.objectContaining({
      type: "agent-question",
      agentId: "agent-1",
      title: "ProjectA / Build",
      body: "응답이 필요합니다.",
    })]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(result.cursor).toBeGreaterThan(issued.cursor);
    expect(service.publish({
      type: "agent-question",
      agentId: "agent-1",
      sessionId: "session-1",
      title: "ProjectA / Build",
    })).toBeNull();
  });

  it("revokes individual devices and every device owned by a revoked login", () => {
    const { service } = createService({ now: () => 10_000 });
    const first = service.issue("owner");
    const second = service.issue("owner");
    const guest = service.issue("guest");

    expect(service.revoke(first.token)).toEqual({ revoked: true });
    expect(service.authenticate(first.token)).toBeNull();
    expect(service.authenticate(second.token)).not.toBeNull();

    service.removeLogin("owner");
    expect(service.authenticate(second.token)).toBeNull();
    expect(service.authenticate(guest.token)).not.toBeNull();
  });
});
