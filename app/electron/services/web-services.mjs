import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>MultiAgent Dashboard</title><style>
body{margin:0;background:#0d1117;color:#c9d1d9;font:14px system-ui}header{padding:18px 24px;border-bottom:1px solid #30363d;display:flex;justify-content:space-between}main{padding:18px;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}.card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:14px}.working{border-color:#d29922}.done{border-color:#238636}small{color:#8b949e}pre{white-space:pre-wrap;max-height:38vh;overflow:auto;background:#090c10;padding:10px;border-radius:6px}input{width:calc(100% - 80px);background:#0d1117;color:#fff;border:1px solid #30363d;padding:8px}button{padding:8px;background:#238636;color:white;border:0;border-radius:5px}</style></head>
<body><header><b id="title">MultiAgent</b><small id="updated">연결 중…</small></header><main id="cards"></main>
<script>
const cards=document.getElementById('cards');const esc=s=>String(s??'');
async function load(){try{const r=await fetch('/api/state');if(r.status===401){location.href='/auth/github';return}const state=await r.json();document.getElementById('title').textContent=state.title||'MultiAgent';document.getElementById('updated').textContent=new Date().toLocaleTimeString();const agents=state.agents||state.sessions||[];cards.replaceChildren(...agents.map(a=>{const d=document.createElement('section');d.className='card '+(a.status==='working'?'working':a.status==='done'?'done':'');const h=document.createElement('b');h.textContent=a.name||a.id;const meta=document.createElement('p');meta.textContent=[a.project||a.projectName,a.tool||a.aiToolId,a.status].filter(Boolean).join(' · ');const out=document.createElement('pre');out.textContent=a.output||a.lastOutput||'';d.append(h,meta,out);if(state.remote){const row=document.createElement('div');const input=document.createElement('input');input.placeholder='명령 또는 메시지';const btn=document.createElement('button');btn.textContent='전송';btn.onclick=async()=>{await fetch('/api/input',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:a.id,data:input.value+'\\r'})});input.value=''};row.append(input,btn);d.append(row)}return d}));}catch(e){document.getElementById('updated').textContent='연결 오류'}}
load();setInterval(load,1500);
</script></body></html>`;

const REMOTE_PWA_DIR = fileURLToPath(new URL("../remote-pwa/", import.meta.url));
const REMOTE_PWA_ASSETS = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/login", { file: "login.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/pwa/styles.css", { file: "styles.css", type: "text/css; charset=utf-8", cache: "no-cache" }],
  ["/pwa/app.js", { file: "app.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/login.js", { file: "login.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/xterm.js", { file: "vendor/xterm.js", type: "text/javascript; charset=utf-8", cache: "public, max-age=86400" }],
  ["/pwa/xterm.css", { file: "vendor/xterm.css", type: "text/css; charset=utf-8", cache: "public, max-age=86400" }],
  ["/manifest.webmanifest", { file: "manifest.webmanifest", type: "application/manifest+json; charset=utf-8", cache: "no-cache" }],
  ["/sw.js", { file: "sw.js", type: "text/javascript; charset=utf-8", cache: "no-cache", serviceWorker: true }],
  ["/icon.svg", { file: "icon.svg", type: "image/svg+xml; charset=utf-8", cache: "public, max-age=86400" }],
  ["/icons/icon-192.png", { file: "icon-192.png", type: "image/png", cache: "public, max-age=86400" }],
  ["/icons/icon-512.png", { file: "icon-512.png", type: "image/png", cache: "public, max-age=86400" }],
]);
const REMOTE_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self' https://github.com",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  // xterm.js applies per-cell/cursor inline styles at runtime; needed for the
  // live terminal. script-src stays strict, which is the XSS-relevant control.
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
].join("; ");

function sendRemoteAsset(response, pathname) {
  const asset = REMOTE_PWA_ASSETS.get(pathname);
  if (!asset) return false;
  const body = fs.readFileSync(path.join(REMOTE_PWA_DIR, asset.file));
  response.writeHead(200, {
    "content-type": asset.type,
    "content-length": body.length,
    "cache-control": asset.cache,
    "content-security-policy": REMOTE_CSP,
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...(asset.serviceWorker ? { "service-worker-allowed": "/" } : {}),
  });
  response.end(body);
  return true;
}

function sendJson(response, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(body);
}

async function readJson(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function listen(server, desiredPort, host = "127.0.0.1") {
  const candidates = desiredPort > 0
    ? Array.from({ length: 50 }, (_, index) => desiredPort + index)
    : [0];
  for (const port of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
      return server.address().port;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("사용 가능한 포트를 찾을 수 없습니다.");
}

export class LocalDashboardService {
  constructor({ title, defaultPort, baseDir, configName, stateProvider }) {
    this.title = title;
    this.defaultPort = defaultPort;
    this.baseDir = baseDir;
    this.configPath = path.join(baseDir, configName);
    this.stateProvider = stateProvider;
    this.state = {};
    this.server = null;
    this.port = null;
    this.config = { enabled: false, serverPort: defaultPort };
    this.loadConfig();
  }

  loadConfig() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      this.config = {
        enabled: Boolean(stored.enabled),
        serverPort: Number(stored.serverPort ?? stored.server_port) || this.defaultPort,
      };
    } catch {}
  }

  async setConfig(config) {
    this.config = {
      enabled: Boolean(config.enabled),
      serverPort: Number(config.serverPort ?? config.server_port) || this.defaultPort,
    };
    await fsPromises.mkdir(this.baseDir, { recursive: true });
    await fsPromises.writeFile(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
    return this.config;
  }

  sync(state) {
    this.state = state && typeof state === "object" ? state : {};
  }

  snapshot() {
    const dynamic = this.stateProvider?.() ?? {};
    return { title: this.title, ...this.state, ...dynamic };
  }

  status() {
    return {
      running: Boolean(this.server?.listening),
      url: this.port ? `http://127.0.0.1:${this.port}` : null,
      port: this.port,
    };
  }

  async start() {
    if (this.server?.listening) return this.status();
    this.server = http.createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/state") {
        sendJson(response, 200, this.snapshot());
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
          "cache-control": "no-store",
        });
        response.end(DASHBOARD_HTML);
        return;
      }
      response.writeHead(404).end();
    });
    this.port = await listen(this.server, this.config.serverPort);
    return this.status();
  }

  async stop() {
    const server = this.server;
    this.server = null;
    this.port = null;
    if (server) await new Promise((resolve) => server.close(resolve));
    return this.status();
  }
}

export class RemoteDashboardService {
  constructor({ baseDir, stateProvider, writePty, requestAccess, fetchImpl = fetch, terminalSnapshot, subscribeTerminal, terminalSize, chatProvider }) {
    this.baseDir = baseDir;
    this.configPath = path.join(baseDir, "remote-config.json");
    this.accessPath = path.join(baseDir, "remote-access.json");
    this.stateProvider = stateProvider;
    this.writePty = writePty;
    this.requestAccess = requestAccess;
    this.fetchImpl = fetchImpl;
    this.terminalSnapshot = terminalSnapshot ?? (() => null);
    this.subscribeTerminal = subscribeTerminal ?? (() => null);
    this.terminalSize = terminalSize ?? (() => null);
    this.chatProvider = chatProvider ?? (() => null);
    this.server = null;
    this.port = null;
    this.agents = [];
    this.view = {};
    this.states = new Map();
    this.secret = crypto.randomBytes(32);
    this.config = { client_id: "", owner: "", tunnel_token: "", public_hostname: "", server_port: 18800, client_secret: "" };
    this.access = { pending: [], approved: [] };
    this.load();
  }

  load() {
    try { this.config = { ...this.config, ...JSON.parse(fs.readFileSync(this.configPath, "utf8")) }; } catch {}
    try { this.access = { ...this.access, ...JSON.parse(fs.readFileSync(this.accessPath, "utf8")) }; } catch {}
  }

  async save(file, value) {
    await fsPromises.mkdir(this.baseDir, { recursive: true });
    await fsPromises.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  }

  async setConfig(config) {
    this.config = { ...this.config, ...config };
    await this.save(this.configPath, this.config);
    return this.config;
  }

  syncAgents(agents) { this.agents = Array.isArray(agents) ? agents : []; }
  syncView(view) {
    try { this.view = typeof view === "string" ? JSON.parse(view) : view; } catch { this.view = {}; }
  }

  accessList() { return { pending: [...this.access.pending], approved: [...this.access.approved] }; }
  async approve(login) {
    this.access.pending = this.access.pending.filter((value) => value.toLowerCase() !== login.toLowerCase());
    if (!this.access.approved.some((value) => value.toLowerCase() === login.toLowerCase())) this.access.approved.push(login);
    await this.save(this.accessPath, this.access);
    return this.accessList();
  }
  async revoke(login) {
    this.access.pending = this.access.pending.filter((value) => value.toLowerCase() !== login.toLowerCase());
    this.access.approved = this.access.approved.filter((value) => value.toLowerCase() !== login.toLowerCase());
    await this.save(this.accessPath, this.access);
    return this.accessList();
  }

  sign(login) {
    const payload = Buffer.from(login, "utf8").toString("base64url");
    const signature = crypto.createHmac("sha256", this.secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  sessionLogin(request) {
    const match = String(request.headers.cookie || "").match(/(?:^|;\s*)multiagent_remote=([^;]+)/);
    if (!match) return null;
    const [payload, signature] = match[1].split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", this.secret).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    return Buffer.from(payload, "base64url").toString("utf8");
  }

  isApproved(login) {
    if (!login) return false;
    return login.toLowerCase() === String(this.config.owner).toLowerCase() ||
      this.access.approved.some((value) => value.toLowerCase() === login.toLowerCase());
  }

  isDirectLocal(request) {
    return !request.headers["cf-connecting-ip"] && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress);
  }

  isSameOrigin(request) {
    if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;
    const origin = String(request.headers.origin || "").trim().toLowerCase();
    if (!origin) return this.isDirectLocal(request);
    const forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (!forwardedHost) return false;
    const allowed = new Set([`http://${forwardedHost}`, `https://${forwardedHost}`]);
    const publicHostname = String(this.config.public_hostname || "").trim().toLowerCase();
    if (publicHostname) allowed.add(`https://${publicHostname}`);
    return allowed.has(origin);
  }

  cookieFor(login, request, maxAge = 604800) {
    const secure = this.config.public_hostname || request.headers["x-forwarded-proto"] === "https";
    const value = login ? this.sign(login) : "";
    return `multiagent_remote=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  }

  async registerLogin(login) {
    if (!this.isApproved(login) && !this.access.pending.some((value) => value.toLowerCase() === login.toLowerCase())) {
      this.access.pending.push(login);
      await this.save(this.accessPath, this.access);
      this.requestAccess?.(login);
    }
  }

  async githubLoginFromToken(token) {
    const userResponse = await this.fetchImpl("https://api.github.com/user", {
      headers: { authorization: `Bearer ${token}`, "user-agent": "MultiAgent" },
      signal: AbortSignal.timeout(15_000),
    });
    const login = String((await userResponse.json()).login || "");
    if (!userResponse.ok || !login) throw new Error("github user failed");
    await this.registerLogin(login);
    return login;
  }

  status() {
    return { running: Boolean(this.server?.listening), url: this.port ? `http://127.0.0.1:${this.port}` : null, port: this.port };
  }

  async handleOAuth(request, response, url) {
    if (url.pathname === "/auth/github") {
      if (!this.config.client_id || !this.config.client_secret) {
        response.writeHead(503, { "content-type": "text/plain; charset=utf-8" }).end("Settings에서 GitHub OAuth 설정이 필요합니다.");
        return true;
      }
      const state = crypto.randomBytes(18).toString("hex");
      this.states.set(state, Date.now() + 10 * 60_000);
      const redirect = new URL("https://github.com/login/oauth/authorize");
      redirect.searchParams.set("client_id", this.config.client_id);
      redirect.searchParams.set("state", state);
      response.writeHead(302, { location: redirect.href }).end();
      return true;
    }
    // Accept both the documented path and the shorter /auth/callback, since
    // GitHub uses the OAuth App's registered callback URL (we don't send an
    // explicit redirect_uri) and users often register the shorter form.
    if (
      url.pathname !== "/auth/github/callback" &&
      url.pathname !== "/auth/callback"
    ) {
      return false;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expires = state ? this.states.get(state) : null;
    if (!code || !state || !expires || expires < Date.now()) {
      response.writeHead(400).end("invalid oauth state");
      return true;
    }
    this.states.delete(state);
    const tokenResponse = await this.fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: this.config.client_id, client_secret: this.config.client_secret, code }),
      signal: AbortSignal.timeout(15_000),
    });
    const token = (await tokenResponse.json()).access_token;
    if (!token) { response.writeHead(401).end("github login failed"); return true; }
    const login = await this.githubLoginFromToken(token).catch(() => "");
    if (!login) { response.writeHead(401).end("github user failed"); return true; }
    response.writeHead(302, {
      location: "/",
      "set-cookie": this.cookieFor(login, request),
    }).end();
    return true;
  }

  async handleDeviceAuth(request, response, url) {
    if (request.method === "GET" && url.pathname === "/auth/mode") {
      sendJson(response, 200, {
        configured: Boolean(this.config.client_id),
        web: Boolean(this.config.client_id && this.config.client_secret && this.config.public_hostname),
      });
      return true;
    }
    if (request.method !== "POST" || !["/auth/start", "/auth/poll"].includes(url.pathname)) return false;
    if (!this.isSameOrigin(request)) {
      sendJson(response, 403, { error: "cross-origin request blocked" });
      return true;
    }
    if (!this.config.client_id) {
      sendJson(response, 503, { error: "GitHub Client ID가 설정되지 않았습니다." });
      return true;
    }
    if (url.pathname === "/auth/start") {
      const githubResponse = await this.fetchImpl("https://github.com/login/device/code", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": "MultiAgent" },
        body: new URLSearchParams({ client_id: this.config.client_id, scope: "read:user" }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await githubResponse.json();
      sendJson(response, githubResponse.ok ? 200 : 502, result);
      return true;
    }
    const body = await readJson(request);
    const deviceCode = String(body.device_code || "").trim();
    if (!deviceCode) {
      sendJson(response, 400, { error: "device_code required" });
      return true;
    }
    const tokenResponse = await this.fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": "MultiAgent" },
      body: new URLSearchParams({
        client_id: this.config.client_id,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokenResult = await tokenResponse.json();
    if (["authorization_pending", "slow_down"].includes(tokenResult.error)) {
      sendJson(response, 200, {
        pending: true,
        slow_down: tokenResult.error === "slow_down",
        interval: Number(tokenResult.interval) || undefined,
      });
      return true;
    }
    if (!tokenResponse.ok || tokenResult.error || !tokenResult.access_token) {
      sendJson(response, 401, { error: tokenResult.error_description || tokenResult.error || "github login failed" });
      return true;
    }
    const login = await this.githubLoginFromToken(tokenResult.access_token);
    sendJson(response, 200, { login, approved: this.isApproved(login) }, {
      "set-cookie": this.cookieFor(login, request),
    });
    return true;
  }

  // Server-Sent Events stream of raw filtered PTY output for the Remote xterm
  // view. First message resets the client terminal and replays the buffer;
  // subsequent messages are live deltas. Input flows back over POST /api/input.
  streamTerminal(request, response, id) {
    const snapshot = this.terminalSnapshot?.(id, 0);
    if (!snapshot) {
      sendJson(response, 404, { error: "session is not active" });
      return;
    }
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
    });

    const send = (event, payload) => {
      if (response.writableEnded) return;
      if (event) response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    let closed = false;
    let unsubscribe = null;
    let heartbeat = null;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      try { unsubscribe?.(); } catch { /* already gone */ }
      if (!response.writableEnded) response.end();
    };

    // Reset + backfill, then subscribe with no await between so the event loop
    // cannot deliver PTY output in the gap (no dropped or duplicated bytes).
    // The client mirrors the PTY's real size — it never resizes the shared PTY,
    // which would reflow the desktop terminal viewing the same session.
    const size = this.terminalSize?.(id) || null;
    send("reset", { data: snapshot.data, cols: size?.cols || null, rows: size?.rows || null });
    unsubscribe = this.subscribeTerminal?.(id, {
      onData: (segment) => send(null, { data: segment.data }),
      onExit: (info) => { send("exit", { code: info?.exitCode ?? null }); cleanup(); },
    });
    if (!unsubscribe) {
      send("exit", { code: null });
      cleanup();
      return;
    }
    heartbeat = setInterval(() => {
      if (!response.writableEnded) response.write(": ping\n\n");
    }, 15_000);
    request.on("close", cleanup);
    request.on("error", cleanup);
  }

  async start() {
    if (this.server?.listening) return this.status();
    this.server = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (await this.handleOAuth(request, response, url)) return;
        if (await this.handleDeviceAuth(request, response, url)) return;
        if (request.method === "POST" && url.pathname === "/auth/logout") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          response.writeHead(204, {
            "set-cookie": this.cookieFor("", request, 0),
            "cache-control": "no-store",
          }).end();
          return;
        }
        const publicAsset = request.method === "GET" && [
          "/login",
          "/pwa/styles.css",
          "/pwa/login.js",
          "/icon.svg",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
        ].includes(url.pathname);
        if (publicAsset && sendRemoteAsset(response, url.pathname)) return;
        const login = this.sessionLogin(request);
        const approved = this.isDirectLocal(request) || this.isApproved(login);
        if (!approved) {
          if (request.method === "GET" && url.pathname === "/") {
            if (login) {
              response.writeHead(403, { "content-type": "text/html; charset=utf-8" })
                .end(`<meta charset="utf-8"><title>승인 대기</title><body style="background:#0d1117;color:#c9d1d9;font:16px system-ui;padding:40px"><h2>GitHub @${login.replace(/[<>&"']/g, "")}</h2><p>MultiAgent 앱에서 원격 접속 요청을 승인해 주세요.</p></body>`);
            } else {
              response.writeHead(302, { location: "/login" }).end();
            }
          } else sendJson(response, 401, { error: "unauthorized", pending: Boolean(login) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/state") {
          const runtime = this.stateProvider?.() ?? {};
          sendJson(response, 200, {
            title: "MultiAgent Remote",
            remote: true,
            pwa: true,
            generatedAt: new Date().toISOString(),
            agents: this.agents,
            view: this.view,
            ...runtime,
          });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/input") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          const body = await readJson(request);
          const id = String(body.id || "").trim();
          const data = String(body.data || "");
          if (!id || !data || data.length > 8 * 1024) {
            sendJson(response, 400, { error: "invalid input" });
            return;
          }
          const accepted = this.writePty?.(id, data);
          if (accepted === false) {
            sendJson(response, 409, { error: "session is not active" });
            return;
          }
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/stream") {
          this.streamTerminal(request, response, String(url.searchParams.get("id") || "").trim());
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/chat") {
          const id = String(url.searchParams.get("id") || "").trim();
          try {
            const result = (await this.chatProvider?.(id)) ?? { blocks: [], missing: true };
            sendJson(response, 200, result);
          } catch (error) {
            sendJson(response, 500, { error: error.message, blocks: [] });
          }
          return;
        }
        if (request.method === "GET" && sendRemoteAsset(response, url.pathname)) return;
        response.writeHead(404).end();
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
    });
    const configuredPort = Number(this.config.server_port);
    const desiredPort = Number.isInteger(configuredPort) && configuredPort >= 0 ? configuredPort : 18800;
    this.port = await listen(this.server, desiredPort);
    return this.status();
  }

  async stop() {
    const server = this.server; this.server = null; this.port = null;
    if (server) {
      // Long-lived SSE terminal streams keep connections open; force them shut
      // so shutdown (and app quit) never blocks on server.close().
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    return this.status();
  }
}

export class TunnelService {
  constructor({ baseDir, getConfig, getLocalUrl, fetchImpl = fetch, spawnImpl = spawn }) {
    this.baseDir = baseDir;
    this.getConfig = getConfig;
    this.getLocalUrl = getLocalUrl;
    this.fetchImpl = fetchImpl;
    this.spawnImpl = spawnImpl;
    this.child = null;
    this.publicUrl = null;
    this.downloadPromise = null;
    this.startPromise = null;
  }
  status() { return { running: Boolean(this.child && !this.child.killed), publicUrl: this.publicUrl }; }

  async ensureExecutable() {
    const executable = path.join(this.baseDir, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
    if (fs.existsSync(executable)) return executable;
    if (process.platform !== "win32") {
      throw new Error("cloudflared를 PATH 또는 MultiAgent 데이터 폴더에 설치해 주세요.");
    }
    if (this.downloadPromise) return this.downloadPromise;
    this.downloadPromise = (async () => {
      await fsPromises.mkdir(this.baseDir, { recursive: true });
      const temporary = `${executable}.${process.pid}.download`;
      try {
        const response = await this.fetchImpl(
          "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
          {
            headers: { "user-agent": "MultiAgent" },
            redirect: "follow",
            signal: AbortSignal.timeout(120_000),
          }
        );
        if (!response.ok || !response.body) throw new Error(`cloudflared download failed: HTTP ${response.status}`);
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
        const downloaded = await fsPromises.stat(temporary);
        if (downloaded.size < 1024 * 1024) throw new Error("cloudflared download was unexpectedly small");
        await fsPromises.rename(temporary, executable);
        return executable;
      } catch (error) {
        await fsPromises.rm(temporary, { force: true }).catch(() => {});
        throw error;
      }
    })().finally(() => { this.downloadPromise = null; });
    return this.downloadPromise;
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    if (this.child && !this.child.killed && this.publicUrl) return this.status();
    this.startPromise = (async () => {
      const config = this.getConfig();
      const executable = await this.ensureExecutable();
      const named = Boolean(config.tunnel_token);
      const localUrl = this.getLocalUrl();
      if (!named && !localUrl) throw new Error("Remote PWA 서버가 실행 중이 아닙니다.");
      const args = named
        ? ["tunnel", "run", "--token", config.tunnel_token]
        : ["tunnel", "--url", localUrl, "--no-autoupdate"];
      const child = this.spawnImpl(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      this.child = child;
      this.publicUrl = null;

      return await new Promise((resolve, reject) => {
        let settled = false;
        let recent = "";
        let timeout = null;
        const finish = (error = null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) {
            if (this.child === child) this.child = null;
            this.publicUrl = null;
            if (!child.killed) child.kill();
            reject(error);
          } else resolve(this.status());
        };
        const inspect = (chunk) => {
          recent = `${recent}${String(chunk)}`.slice(-8192);
          if (named && recent.includes("Registered tunnel connection")) {
            this.publicUrl = config.public_hostname ? `https://${config.public_hostname}` : null;
            finish();
            return;
          }
          if (!named) {
            const match = recent.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
            if (match) {
              this.publicUrl = match[0].replace(/\/$/, "");
              finish();
            }
          }
        };
        child.stdout?.on("data", inspect);
        child.stderr?.on("data", inspect);
        child.once("error", (error) => finish(error));
        child.once("exit", (code) => {
          if (this.child === child) this.child = null;
          if (!settled) finish(new Error(`cloudflared exited before the tunnel was ready (${code ?? "unknown"})`));
        });
        timeout = setTimeout(() => {
          finish(new Error(named
            ? "cloudflared did not connect within 45s (check tunnel token)"
            : "cloudflared did not report a tunnel URL within 45s"));
        }, 45_000);
      });
    })().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }
  async stop() {
    if (this.child) this.child.kill();
    this.child = null;
    this.publicUrl = null;
    return this.status();
  }
}
