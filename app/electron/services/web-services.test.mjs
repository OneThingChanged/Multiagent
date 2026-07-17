import fs from "node:fs";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDashboardService, RemoteDashboardService, TunnelService } from "./web-services.mjs";

const services = [];
const roots = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.stop()));
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe("Electron dashboard server", () => {
  it("serves synchronized state on a loopback-only random port", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-web-"));
    roots.push(root);
    const service = new LocalDashboardService({ title: "Test", defaultPort: 0, baseDir: root, configName: "test.json" });
    services.push(service);
    service.sync({ agents: [{ id: "a", name: "세션", status: "working" }] });
    const status = await service.start();
    const state = await fetch(`${status.url}/api/state`).then((response) => response.json());
    expect(state.title).toBe("Test");
    expect(state.agents[0].name).toBe("세션");
  });

  it("serves the authenticated mobile PWA shell and live session state", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-pwa-"));
    roots.push(root);
    const service = new RemoteDashboardService({
      baseDir: root,
      stateProvider: () => ({
        agents: [{
          id: "agent-1",
          name: "세션 1",
          project: "ProjectA",
          status: "working",
          output: "최근 출력",
          hook: { event: "waiting", interactive_question: "계속할까요?" },
        }],
      }),
      writePty: () => true,
    });
    services.push(service);
    service.config.server_port = 0;
    service.syncAgents([{ id: "agent-1", name: "세션 1", project: "ProjectA", status: "working" }]);
    service.syncView({
      projects: [{ id: "p1", name: "ProjectA" }],
      agents: [
        { id: "agent-1", projectId: "p1" },
        { id: "agent-2", projectId: "p1" },
      ],
      groups: [{
        id: "screen-1",
        layout: {
          type: "split",
          direction: "h",
          children: [
            { type: "leaf", id: "leaf-1", tabs: ["agent-1"], activeIndex: 0 },
            { type: "leaf", id: "leaf-2", tabs: ["agent-2"], activeIndex: 0 },
          ],
          sizes: [0.5, 0.5],
        },
      }],
      activeGroupId: "screen-1",
    });

    const status = await service.start();
    const [page, appScript, styles, manifest, worker, state] = await Promise.all([
      fetch(status.url),
      fetch(`${status.url}/pwa/app.js`),
      fetch(`${status.url}/pwa/styles.css`),
      fetch(`${status.url}/manifest.webmanifest`),
      fetch(`${status.url}/sw.js`),
      fetch(`${status.url}/api/state`),
    ]);
    const externalRoot = await fetch(status.url, {
      redirect: "manual",
      headers: { "cf-connecting-ip": "203.0.113.10" },
    });
    const externalLogin = await fetch(`${status.url}/login`, {
      headers: { "cf-connecting-ip": "203.0.113.10" },
    });
    const pageBody = await page.text();
    const appScriptBody = await appScript.text();
    const stylesBody = await styles.text();
    const manifestBody = await manifest.json();
    const workerBody = await worker.text();
    const stateBody = await state.json();

    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(pageBody).toContain("MultiAgent Remote");
    expect(pageBody).toContain("/manifest.webmanifest");
    expect(pageBody).toContain("Remote Monitor");
    expect(pageBody).toContain("SCREENS");
    expect(appScriptBody).toContain("function renderScreen()");
    expect(appScriptBody).toContain("function renderMonitor()");
    expect(stylesBody).toContain(".monitor-board");
    expect(stylesBody).toContain(".screen-layout");
    expect(manifestBody.display).toBe("standalone");
    expect(worker.headers.get("service-worker-allowed")).toBe("/");
    expect(workerBody).toContain("notificationclick");
    expect(stateBody.pwa).toBe(true);
    expect(stateBody.agents[0].output).toBe("최근 출력");
    expect(stateBody.agents[0].hook.interactive_question).toBe("계속할까요?");
    expect(stateBody.view.projects[0].name).toBe("ProjectA");
    expect(stateBody.view.groups[0].id).toBe("screen-1");
    expect(stateBody.view.activeGroupId).toBe("screen-1");
    expect(externalRoot.status).toBe(302);
    expect(externalRoot.headers.get("location")).toBe("/login");
    expect(externalLogin.status).toBe(200);
    expect(await externalLogin.text()).toContain("GitHub 계정으로");
  });

  it("accepts same-origin JSON input and blocks cross-origin commands", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-input-"));
    roots.push(root);
    const writes = [];
    const service = new RemoteDashboardService({
      baseDir: root,
      stateProvider: () => ({}),
      writePty(id, data) {
        writes.push({ id, data });
        return id === "agent-1";
      },
    });
    services.push(service);
    service.config.server_port = 0;
    const status = await service.start();

    const accepted = await fetch(`${status.url}/api/input`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ id: "agent-1", data: "계속 진행해줘\r" }),
    });
    const blocked = await fetch(`${status.url}/api/input`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.invalid", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ id: "agent-1", data: "malicious\r" }),
    });

    expect(accepted.status).toBe(200);
    expect(writes).toEqual([{ id: "agent-1", data: "계속 진행해줘\r" }]);
    expect(blocked.status).toBe(403);
  });

  it("supports an ephemeral Remote port and clears the login cookie on logout", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-port-"));
    roots.push(root);
    const service = new RemoteDashboardService({ baseDir: root, stateProvider: () => ({}), writePty: () => false });
    services.push(service);
    service.config.server_port = 0;
    const status = await service.start();
    const logout = await fetch(`${status.url}/auth/logout`, { method: "POST", headers: { origin: status.url } });

    expect(status.port).toBeGreaterThan(0);
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("completes GitHub Device Flow for quick-tunnel login", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-device-login-"));
    roots.push(root);
    const requests = [];
    const fetchImpl = async (url) => {
      requests.push(String(url));
      if (String(url).endsWith("/login/device/code")) {
        return new Response(JSON.stringify({
          device_code: "device-123",
          user_code: "ABCD-EFGH",
          verification_uri: "https://github.com/login/device",
          interval: 5,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (String(url).endsWith("/login/oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "token-123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (String(url).endsWith("/user")) {
        return new Response(JSON.stringify({ login: "owner-user" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const service = new RemoteDashboardService({
      baseDir: root,
      stateProvider: () => ({}),
      writePty: () => false,
      fetchImpl,
    });
    services.push(service);
    service.config = { ...service.config, client_id: "client-123", owner: "owner-user", server_port: 0 };
    const status = await service.start();

    const mode = await fetch(`${status.url}/auth/mode`).then((response) => response.json());
    const start = await fetch(`${status.url}/auth/start`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: "{}",
    }).then((response) => response.json());
    const pollResponse = await fetch(`${status.url}/auth/poll`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ device_code: start.device_code }),
    });
    const poll = await pollResponse.json();

    expect(mode).toEqual({ configured: true, web: false });
    expect(start.user_code).toBe("ABCD-EFGH");
    expect(poll).toEqual({ login: "owner-user", approved: true });
    expect(pollResponse.headers.get("set-cookie")).toContain("multiagent_remote=");
    expect(requests).toEqual([
      "https://github.com/login/device/code",
      "https://github.com/login/oauth/access_token",
      "https://api.github.com/user",
    ]);
  });

  it("waits for a quick tunnel URL before reporting the tunnel ready", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-tunnel-"));
    roots.push(root);
    fs.writeFileSync(path.join(root, process.platform === "win32" ? "cloudflared.exe" : "cloudflared"), "stub");
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => { child.killed = true; child.emit("exit", 0); };
    let spawnedArgs = null;
    const service = new TunnelService({
      baseDir: root,
      getConfig: () => ({ tunnel_token: "", public_hostname: "" }),
      getLocalUrl: () => "http://127.0.0.1:18800",
      spawnImpl(_executable, args) {
        spawnedArgs = args;
        setTimeout(() => child.stderr.write("INF https://sample.trycloudflare.com ready\n"), 0);
        return child;
      },
    });

    const status = await service.start();
    expect(status).toEqual({ running: true, publicUrl: "https://sample.trycloudflare.com" });
    expect(spawnedArgs).toEqual(["tunnel", "--url", "http://127.0.0.1:18800", "--no-autoupdate"]);
    await service.stop();
  });
});
