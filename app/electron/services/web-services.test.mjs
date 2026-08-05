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
    const mobileApkPath = path.join(root, "MultiAgent-Mobile.apk");
    fs.writeFileSync(mobileApkPath, "0123456789");
    const usageRefreshes = [];
    const service = new RemoteDashboardService({
      baseDir: root,
      mobileApkPath,
      usageProvider: async (refresh) => {
        usageRefreshes.push(refresh);
        return {
          updatedAt: 1_785_484_800_000,
          limits: [{
            limitId: "codex",
            limitName: "Codex",
            planType: "plus",
            primary: { usedPercent: 42, windowMinutes: 300, resetsAt: 1_785_488_400 },
            secondary: { usedPercent: 18, windowMinutes: 10_080, resetsAt: 1_786_089_600 },
            credits: { hasCredits: false, unlimited: false, balance: null },
            updatedAt: 1_785_484_800_000,
          }],
        };
      },
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
    const [page, appScript, touchScript, styles, manifest, worker, state, usage, apkDownload, apkHead, apkRange, apkBadRange] = await Promise.all([
      fetch(status.url),
      fetch(`${status.url}/pwa/app.js`),
      fetch(`${status.url}/pwa/terminal-touch.js`),
      fetch(`${status.url}/pwa/styles.css`),
      fetch(`${status.url}/manifest.webmanifest`),
      fetch(`${status.url}/sw.js`),
      fetch(`${status.url}/api/state`),
      fetch(`${status.url}/api/usage?refresh=1`),
      fetch(`${status.url}/downloads/MultiAgent-Mobile.apk`),
      fetch(`${status.url}/downloads/MultiAgent-Mobile.apk`, { method: "HEAD" }),
      fetch(`${status.url}/downloads/MultiAgent-Mobile.apk`, {
        headers: { range: "bytes=2-5" },
      }),
      fetch(`${status.url}/downloads/MultiAgent-Mobile.apk`, {
        headers: { range: "bytes=99-120" },
      }),
    ]);
    const externalRoot = await fetch(status.url, {
      redirect: "manual",
      headers: { "cf-connecting-ip": "203.0.113.10" },
    });
    const externalLogin = await fetch(`${status.url}/login`, {
      headers: { "cf-connecting-ip": "203.0.113.10" },
    });
    const externalDownload = await fetch(
      `${status.url}/downloads/MultiAgent-Mobile.apk`,
      { headers: { "cf-connecting-ip": "203.0.113.10" } },
    );
    const externalUsage = await fetch(`${status.url}/api/usage`, {
      headers: { "cf-connecting-ip": "203.0.113.10" },
    });
    const pushKey = await fetch(`${status.url}/api/push/public-key`).then((response) => response.json());
    const pushSubscription = await fetch(`${status.url}/api/push/subscription`, {
      method: "POST",
      headers: { origin: status.url, "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://push.example.test/device-1",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      }),
    });
    const throttledUsage = await fetch(`${status.url}/api/usage?refresh=1`);
    const pageBody = await page.text();
    const appScriptBody = await appScript.text();
    const touchScriptBody = await touchScript.text();
    const stylesBody = await styles.text();
    const manifestBody = await manifest.json();
    const workerBody = await worker.text();
    const stateBody = await state.json();
    const usageBody = await usage.json();
    const apkBody = Buffer.from(await apkDownload.arrayBuffer()).toString();
    const apkRangeBody = Buffer.from(await apkRange.arrayBuffer()).toString();

    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(pageBody).toContain("MultiAgent Remote");
    expect(pageBody).toContain("/manifest.webmanifest");
    expect(pageBody).toContain("Remote Monitor");
    expect(pageBody).toContain("interactive-widget=resizes-content");
    expect(pageBody).toContain("/pwa/terminal-touch.js");
    expect(pageBody).toContain('id="attachmentButton"');
    expect(pageBody).toContain('id="attachmentInput"');
    expect(pageBody).toContain('aria-label="이미지 첨부, 붙여넣기 또는 드래그 앤 드롭"');
    expect(pageBody).not.toContain('id="composerKeys"');
    expect(pageBody).toContain('id="sessionNavButton"');
    expect(pageBody).toContain('id="androidDownloadButton"');
    expect(pageBody).toContain("SCREENS");
    expect(pageBody).toContain('id="documentsView"');
    expect(pageBody).toContain('id="documentList" role="tree"');
    expect(pageBody).toContain('id="usageView"');
    expect(pageBody).toContain('id="mobileSessionsButton"');
    expect(pageBody).toContain('data-filter="active"');
    expect(pageBody).toContain('data-filter="recovering"');
    expect(pageBody).toContain('id="restartSessionButton" type="button">활성화</button>');
    expect(pageBody).not.toContain('id="mobileScreensButton"');
    expect(pageBody).not.toContain('id="mobileQuestionsButton"');
    expect(pageBody).toContain('id="overviewButton" type="button" hidden');
    expect(pageBody).toContain('id="mobileMonitorButton" type="button" hidden');
    expect(pageBody).toContain('class="monitor-strip" aria-label="세션 상태 요약" hidden');
    expect(appScriptBody).toContain("function renderScreen()");
    expect(appScriptBody).toContain("function renderScreenChat(container, data, agent)");
    expect(appScriptBody).toContain("function syncScreenChats(screen = selectedScreen())");
    expect(appScriptBody).toContain('dataset.screenPaneMode = mode');
    expect(appScriptBody).toContain('"remote-workspace-locked"');
    expect(appScriptBody).toContain("function renderMonitor()");
    expect(appScriptBody).toContain("function renderDocuments()");
    expect(appScriptBody).toContain("function buildDocumentTree(documents)");
    expect(appScriptBody).toContain("function appendDocumentTree(container, node, projectId, query");
    expect(appScriptBody).toContain("const documentExpandedFolders = new Map()");
    expect(appScriptBody).toContain("function renderUsage()");
    expect(appScriptBody).toContain("ui.appShell.dataset.view = selection.type");
    expect(appScriptBody).toContain("function setSessionViewMode(mode)");
    expect(appScriptBody).toContain("function requestSessionActivation(agentId");
    expect(appScriptBody).toContain("async function cancelSession(agentId)");
    expect(appScriptBody).toContain('fetch("/api/session/cancel"');
    expect(appScriptBody).toContain("function waitForSessionReady(agentId)");
    expect(appScriptBody).toContain("SESSION_ACTIVATION_TIMEOUT_MS = 30_000");
    expect(appScriptBody).toContain('activeFilter === "active"');
    expect(appScriptBody).toContain('rawStatus === "recovering"');
    expect(appScriptBody).toContain('const agentInitializing = (agent)');
    expect(appScriptBody).toContain('inactive && sessionViewMode !== "chat"');
    expect(appScriptBody).toContain("dataset.sessionMode = sessionViewMode");
    expect(appScriptBody).toContain('fetch("/api/attachment"');
    expect(appScriptBody).toContain("function clipboardImageFiles(event)");
    expect(appScriptBody).toContain("function handleComposerImagePaste(event)");
    expect(appScriptBody).toContain('addEventListener("paste", handleComposerImagePaste)');
    expect(appScriptBody).toContain('addAttachments(files, { source: "clipboard" })');
    expect(appScriptBody).toContain("function handleComposerImageDrop(event)");
    expect(appScriptBody).toContain('addEventListener("drop", handleComposerImageDrop)');
    expect(appScriptBody).toContain('addAttachments(files, { source: "drop" })');
    expect(appScriptBody).toContain("function syncMobileAppDownload(info)");
    expect(appScriptBody).toContain("function ensureBackgroundPush(registration)");
    expect(appScriptBody).toContain("function syncVisualViewport()");
    expect(appScriptBody).toContain("function resizeComposerInput()");
    expect(appScriptBody).toContain("input.scrollHeight + borderHeight");
    expect(appScriptBody).toContain('input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden"');
    expect(appScriptBody).toContain('style.setProperty("--visual-viewport-height"');
    expect(appScriptBody).toContain('classList.toggle("keyboard-visible"');
    expect(appScriptBody).toContain("availableHeight / naturalHeight");
    expect(appScriptBody).not.toContain("Math.ceil(element.offsetHeight * scale)");
    expect(appScriptBody).toContain('fetch("/api/push/subscription"');
    expect(appScriptBody).toContain("compactWorkspaceMedia.matches");
    expect(appScriptBody).toContain("MultiAgentTerminalTouch?.install");
    expect(touchScriptBody).toContain("function scrollLinesImmediately");
    expect(touchScriptBody).toContain('addEventListener("touchmove"');
    expect(stylesBody).toContain(".monitor-board");
    expect(stylesBody).toContain(".screen-layout");
    expect(stylesBody).toContain(".screen-pane-mode");
    expect(stylesBody).toContain(".screen-chat-view");
    expect(stylesBody).toContain("html.remote-workspace-locked .workspace");
    expect(stylesBody).toContain("html.remote-workspace-locked .chat-view");
    expect(stylesBody).toContain("html.remote-workspace-locked .usage-view");
    expect(stylesBody).toContain(".session-nav-button:hover");
    expect(stylesBody).toContain(".documents-layout");
    expect(stylesBody).toContain(".document-folder-row");
    expect(stylesBody).toContain("grid-template-rows: auto auto minmax(0, 1fr)");
    expect(stylesBody).not.toContain("max-height: 625px");
    expect(stylesBody).toContain(".usage-provider-grid");
    expect(stylesBody).toContain(".usage-remaining-progress");
    expect(stylesBody).toContain('.app-shell[data-view="session"] .chat-view');
    expect(stylesBody).toContain(".composer-main-row");
    expect(stylesBody).toContain(".composer textarea { flex: 1 1 auto");
    expect(stylesBody).toContain("max-height: min(220px, 34dvh)");
    expect(stylesBody).toContain(".composer-main-row { display: flex; align-items: flex-end");
    expect(stylesBody).toContain(".composer-attachment");
    expect(stylesBody).toContain(".composer.drag-active::after");
    expect(stylesBody).toContain(".session-head-actions");
    expect(stylesBody).toContain('[data-session-mode="chat"] .question-panel');
    expect(stylesBody).toContain("touch-action: pinch-zoom");
    expect(stylesBody).toContain("--visual-viewport-height: 100dvh");
    expect(stylesBody).toContain("html.keyboard-visible .mobile-nav");
    expect(appScriptBody).toContain("mobile streams only its selected pane");
    expect(stylesBody).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
    expect(stylesBody).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(manifestBody.display).toBe("standalone");
    expect(worker.headers.get("service-worker-allowed")).toBe("/");
    expect(workerBody).toContain("notificationclick");
    expect(workerBody).toContain('multiagent-remote-v47');
    expect(workerBody).toContain('addEventListener("push"');
    expect(workerBody).toContain('url.pathname.startsWith("/downloads/")');
    expect(stateBody.pwa).toBe(true);
    expect(stateBody.mobileApp).toEqual({
      available: true,
      downloadUrl: "/downloads/MultiAgent-Mobile.apk",
      filename: "MultiAgent-Mobile.apk",
      size: 10,
      architecture: "arm64-v8a",
      minAndroidApi: 24,
    });
    expect(stateBody.agents[0].output).toBe("최근 출력");
    expect(stateBody.agents[0].hook.interactive_question).toBe("계속할까요?");
    expect(stateBody.view.projects[0].name).toBe("ProjectA");
    expect(stateBody.view.groups[0].id).toBe("screen-1");
    expect(stateBody.view.activeGroupId).toBe("screen-1");
    expect(usageBody.limits[0]).toMatchObject({
      limitId: "codex",
      primary: { usedPercent: 42, windowMinutes: 300 },
    });
    expect(usageRefreshes).toEqual([true, false]);
    expect(throttledUsage.status).toBe(200);
    expect(apkDownload.status).toBe(200);
    expect(apkDownload.headers.get("content-type")).toBe("application/vnd.android.package-archive");
    expect(apkDownload.headers.get("content-disposition")).toContain("MultiAgent-Mobile.apk");
    expect(apkBody).toBe("0123456789");
    expect(apkHead.status).toBe(200);
    expect(apkHead.headers.get("content-length")).toBe("10");
    expect(apkRange.status).toBe(206);
    expect(apkRange.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(apkRangeBody).toBe("2345");
    expect(apkBadRange.status).toBe(416);
    expect(apkBadRange.headers.get("content-range")).toBe("bytes */10");
    expect(externalRoot.status).toBe(302);
    expect(externalRoot.headers.get("location")).toBe("/login");
    expect(externalLogin.status).toBe(200);
    expect(externalDownload.status).toBe(401);
    expect(externalUsage.status).toBe(401);
    expect(pushKey.supported).toBe(true);
    expect(pushKey.publicKey).toBeTruthy();
    expect(pushSubscription.status).toBe(201);
    const loginBody = await externalLogin.text();
    // The heading text is set at runtime by login.js per auth mode; assert on
    // stable markup instead (brand + the elements login.js drives).
    expect(loginBody).toContain("MultiAgent Remote");
    expect(loginBody).toContain('id="startLogin"');
    expect(loginBody).toContain('id="deviceCode"');
  });

  it("lists and reads sandboxed Markdown/HTML project documents", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-docs-"));
    roots.push(root);
    const projectRoot = path.join(root, "project");
    fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "docs", "README.md"), "# Remote 문서\n");
    fs.writeFileSync(path.join(projectRoot, "docs", "preview.html"), "<h1>Preview</h1><script>throw new Error('blocked')</script>");
    fs.writeFileSync(path.join(projectRoot, "notes.txt"), "not allowed");
    fs.writeFileSync(path.join(projectRoot, "node_modules", "hidden.md"), "# hidden");
    fs.writeFileSync(path.join(root, "outside.md"), "# outside");
    fs.writeFileSync(path.join(projectRoot, "docs", "large.md"), Buffer.alloc(2 * 1024 * 1024 + 1, 65));

    const service = new RemoteDashboardService({
      baseDir: root,
      stateProvider: () => ({}),
      writePty: () => false,
    });
    services.push(service);
    service.config.server_port = 0;
    service.syncView({
      projects: [
        { id: "local", name: "Local", folder: projectRoot },
        { id: "ssh", name: "SSH", folder: "/remote/project", sshHostId: "host-1" },
      ],
      agents: [],
      groups: [],
    });
    const status = await service.start();

    const listResponse = await fetch(`${status.url}/api/docs?projectId=local`);
    const list = await listResponse.json();
    const markdown = await fetch(
      `${status.url}/api/docs/read?${new URLSearchParams({ projectId: "local", path: "docs/README.md" })}`,
    ).then((response) => response.json());
    const html = await fetch(
      `${status.url}/api/docs/read?${new URLSearchParams({ projectId: "local", path: "docs/preview.html" })}`,
    ).then((response) => response.json());
    const traversal = await fetch(
      `${status.url}/api/docs/read?${new URLSearchParams({ projectId: "local", path: "../outside.md" })}`,
    );
    const unsupported = await fetch(
      `${status.url}/api/docs/read?${new URLSearchParams({ projectId: "local", path: "notes.txt" })}`,
    );
    const oversized = await fetch(
      `${status.url}/api/docs/read?${new URLSearchParams({ projectId: "local", path: "docs/large.md" })}`,
    );
    const ssh = await fetch(`${status.url}/api/docs?projectId=ssh`);

    expect(listResponse.status).toBe(200);
    expect(list.documents.map((document) => document.path)).toEqual([
      "docs/large.md",
      "docs/preview.html",
      "docs/README.md",
    ]);
    expect(list.documents.some((document) => document.path.includes("node_modules"))).toBe(false);
    expect(markdown).toMatchObject({ kind: "markdown", path: "docs/README.md", content: "# Remote 문서\n" });
    expect(html.kind).toBe("html");
    expect(html.content).toContain("<script>");
    expect(traversal.status).toBe(403);
    expect(unsupported.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(ssh.status).toBe(409);
  });

  it("accepts same-origin JSON input and blocks cross-origin commands", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-input-"));
    roots.push(root);
    const writes = [];
    const activations = [];
    const cancellations = [];
    const service = new RemoteDashboardService({
      baseDir: root,
      stateProvider: () => ({}),
      writePty(id, data) {
        writes.push({ id, data });
        return id === "agent-1";
      },
      restartSession(id) {
        activations.push(id);
        return true;
      },
      cancelSession(id) {
        cancellations.push(id);
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
    const activated = await fetch(`${status.url}/api/session/restart`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ id: "agent-offline" }),
    });
    const cancelled = await fetch(`${status.url}/api/session/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ id: "agent-1" }),
    });
    const inactiveCancel = await fetch(`${status.url}/api/session/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ id: "agent-offline" }),
    });
    const blockedCancel = await fetch(`${status.url}/api/session/cancel`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ id: "agent-1" }),
    });

    expect(accepted.status).toBe(200);
    expect(writes).toEqual([{ id: "agent-1", data: "계속 진행해줘\r" }]);
    expect(blocked.status).toBe(403);
    expect(activated.status).toBe(200);
    expect(activations).toEqual(["agent-offline"]);
    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toEqual({ ok: true, status: "idle" });
    expect(inactiveCancel.status).toBe(409);
    expect(blockedCancel.status).toBe(403);
    expect(cancellations).toEqual(["agent-1", "agent-offline"]);
  });

  it("authenticates push subscriptions and forwards done hooks to background delivery", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-push-api-"));
    roots.push(root);
    const calls = [];
    const pushService = {
      publicKey: () => "public-vapid",
      subscribe(login, value) {
        calls.push({ type: "subscribe", login, value });
        return { subscribed: true };
      },
      unsubscribe(login, endpoint) {
        calls.push({ type: "unsubscribe", login, endpoint });
        return { subscribed: false };
      },
      removeLogin: () => {},
      async notifyDone(value) {
        calls.push({ type: "notify", value });
        return { sent: 1 };
      },
    };
    const service = new RemoteDashboardService({
      baseDir: root,
      stateProvider: () => ({}),
      writePty: () => false,
      pushService,
    });
    services.push(service);
    service.config.server_port = 0;
    service.syncAgents([{ id: "agent-1", name: "Build", project: "ProjectA" }]);
    const status = await service.start();
    const value = {
      endpoint: "https://push.example.test/device-1",
      keys: { p256dh: "key", auth: "auth" },
    };

    const subscribed = await fetch(`${status.url}/api/push/subscription`, {
      method: "POST",
      headers: { origin: status.url, "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    const blocked = await fetch(`${status.url}/api/push/subscription`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    await service.notifyAgentDone({
      id: "agent-1",
      event: "done",
      session_id: "session-1",
    });

    expect(subscribed.status).toBe(201);
    expect(blocked.status).toBe(403);
    expect(calls).toContainEqual({ type: "subscribe", login: "__local__", value });
    expect(calls).toContainEqual({
      type: "notify",
      value: {
        agentId: "agent-1",
        sessionId: "session-1",
        title: "ProjectA / Build",
      },
    });
  });

  it("stores bounded same-origin image attachments and rejects spoofed or cross-origin files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-attachment-"));
    roots.push(root);
    const service = new RemoteDashboardService({
      baseDir: root,
      stateProvider: () => ({}),
      writePty: () => true,
    });
    services.push(service);
    service.config.server_port = 0;
    const status = await service.start();
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const requestBody = {
      id: "agent-1",
      name: "phone capture.png",
      type: "image/png",
      data: `data:image/png;base64,${png.toString("base64")}`,
    };

    const accepted = await fetch(`${status.url}/api/attachment`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify(requestBody),
    });
    const uploaded = await accepted.json();
    const spoofed = await fetch(`${status.url}/api/attachment`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ ...requestBody, data: `data:image/png;base64,${Buffer.from("not an image").toString("base64")}` }),
    });
    const blocked = await fetch(`${status.url}/api/attachment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify(requestBody),
    });

    expect(accepted.status).toBe(201);
    expect(uploaded).toMatchObject({ name: "phone capture.png", type: "image/png", size: png.length });
    expect(path.dirname(uploaded.path)).toBe(path.join(root, "remote-attachments"));
    expect(fs.readFileSync(uploaded.path)).toEqual(png);
    expect(spoofed.status).toBe(415);
    expect(blocked.status).toBe(403);
  });

  it("serves the full Remote PWA + chat/input from the local Dashboard when providers are given", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-dash-pwa-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "docs"));
    fs.writeFileSync(path.join(root, "docs", "local.md"), "# Local dashboard");
    const writes = [];
    const cancellations = [];
    const service = new LocalDashboardService({
      title: "Monitor",
      defaultPort: 0,
      baseDir: root,
      configName: "monitor.json",
      stateProvider: () => ({
        pwa: true,
        agents: [],
        view: {
          projects: [{ id: "local-project", name: "Local", folder: root }],
          agents: [],
          groups: [],
        },
      }),
      providers: {
        writePty: (id, data) => {
          if (id === "agent-offline") return false;
          writes.push({ id, data });
          return true;
        },
        chatProvider: (id) => ({ blocks: [{ role: "user", kind: "text", text: `hi ${id}` }], missing: false }),
        terminalSnapshot: () => null,
        subscribeTerminal: () => null,
        terminalSize: () => null,
        restartSession: () => true,
        cancelSession: (id) => {
          cancellations.push(id);
          return id === "agent-9";
        },
      },
    });
    services.push(service);
    const status = await service.start();

    const page = await fetch(status.url).then((r) => r.text());
    expect(page).toContain("Remote Monitor");
    const state = await fetch(`${status.url}/api/state`).then((r) => r.json());
    expect(state.pwa).toBe(true);
    const chat = await fetch(`${status.url}/api/chat?id=agent-9`).then((r) => r.json());
    expect(chat.blocks[0].text).toBe("hi agent-9");
    const docs = await fetch(`${status.url}/api/docs?projectId=local-project`).then((r) => r.json());
    expect(docs.documents).toContainEqual({ name: "local.md", path: "docs/local.md", kind: "markdown" });
    const input = await fetch(`${status.url}/api/input`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ id: "agent-9", data: "go\r" }),
    });
    expect(input.status).toBe(200);
    expect(writes).toEqual([{ id: "agent-9", data: "go\r" }]);
    const cancelled = await fetch(`${status.url}/api/session/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ id: "agent-9" }),
    });
    expect(cancelled.status).toBe(200);
    expect(cancellations).toEqual(["agent-9"]);

    const lanHost = `192.168.10.25:${new URL(status.url).port}`;
    expect(service.isLocalOrigin({
      headers: { host: lanHost, origin: `http://${lanHost}` },
    })).toBe(true);
    expect(service.isLocalOrigin({
      headers: {
        host: lanHost,
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
      },
    })).toBe(false);
    const lanInput = await fetch(`${status.url}/api/input`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": lanHost,
        origin: `http://${lanHost}`,
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ id: "agent-9", data: "lan\r" }),
    });
    const crossSiteInput = await fetch(`${status.url}/api/input`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": lanHost,
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ id: "agent-9", data: "blocked\r" }),
    });
    expect(lanInput.status).toBe(200);
    expect(crossSiteInput.status).toBe(403);
    const inactiveInput = await fetch(`${status.url}/api/input`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: status.url },
      body: JSON.stringify({ id: "agent-offline", data: "hello\r" }),
    });
    expect(inactiveInput.status).toBe(409);
    await expect(inactiveInput.json()).resolves.toEqual({ error: "session is not active" });
    expect(writes).toEqual([
      { id: "agent-9", data: "go\r" },
      { id: "agent-9", data: "lan\r" },
    ]);
  });

  it("streams raw terminal output over SSE with backfill, live deltas, and exit", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-stream-"));
    roots.push(root);
    let listener = null;
    const service = new RemoteDashboardService({
      baseDir: root,
      stateProvider: () => ({}),
      writePty: () => true,
      terminalSnapshot: (id) => (id === "agent-1" ? { data: "backfill\r\n", sequenceEnd: 10 } : null),
      subscribeTerminal: (id, candidate) => {
        if (id !== "agent-1") return null;
        listener = candidate;
        return () => { listener = null; };
      },
      terminalSize: () => ({ cols: 100, rows: 24 }),
    });
    services.push(service);
    service.config.server_port = 0;
    const status = await service.start();

    const missing = await fetch(`${status.url}/api/stream?id=ghost`);
    expect(missing.status).toBe(404);

    const controller = new AbortController();
    const streamed = await fetch(`${status.url}/api/stream?id=agent-1`, { signal: controller.signal });
    expect(streamed.status).toBe(200);
    expect(streamed.headers.get("content-type")).toContain("text/event-stream");

    const reader = streamed.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const readUntil = async (predicate) => {
      for (let attempt = 0; attempt < 30 && !predicate(buffer); attempt += 1) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        if (done) break;
      }
      if (!predicate(buffer)) throw new Error(`SSE timeout; got: ${buffer}`);
    };

    await readUntil((text) => text.includes('"cols":100'));
    expect(buffer).toContain("event: reset");
    expect(buffer).toContain("backfill");
    expect(typeof listener?.onData).toBe("function");

    listener.onData({ id: "agent-1", data: "live-delta\r\n" });
    await readUntil((text) => text.includes("live-delta"));

    listener.onExit({ id: "agent-1", exitCode: 0 });
    await readUntil((text) => text.includes("event: exit"));

    controller.abort();
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
