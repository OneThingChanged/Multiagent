import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

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

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
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
  constructor({ baseDir, stateProvider, writePty, requestAccess }) {
    this.baseDir = baseDir;
    this.configPath = path.join(baseDir, "remote-config.json");
    this.accessPath = path.join(baseDir, "remote-access.json");
    this.stateProvider = stateProvider;
    this.writePty = writePty;
    this.requestAccess = requestAccess;
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
    if (url.pathname !== "/auth/github/callback") return false;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expires = state ? this.states.get(state) : null;
    if (!code || !state || !expires || expires < Date.now()) {
      response.writeHead(400).end("invalid oauth state");
      return true;
    }
    this.states.delete(state);
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: this.config.client_id, client_secret: this.config.client_secret, code }),
    });
    const token = (await tokenResponse.json()).access_token;
    if (!token) { response.writeHead(401).end("github login failed"); return true; }
    const userResponse = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${token}`, "user-agent": "MultiAgent" } });
    const login = String((await userResponse.json()).login || "");
    if (!login) { response.writeHead(401).end("github user failed"); return true; }
    if (!this.isApproved(login) && !this.access.pending.some((value) => value.toLowerCase() === login.toLowerCase())) {
      this.access.pending.push(login);
      await this.save(this.accessPath, this.access);
      this.requestAccess?.(login);
    }
    response.writeHead(302, {
      location: "/",
      "set-cookie": `multiagent_remote=${this.sign(login)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${this.config.public_hostname ? "; Secure" : ""}`,
    }).end();
    return true;
  }

  async start() {
    if (this.server?.listening) return this.status();
    this.server = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (await this.handleOAuth(request, response, url)) return;
        const login = this.sessionLogin(request);
        const approved = this.isDirectLocal(request) || this.isApproved(login);
        if (!approved) {
          if (request.method === "GET" && url.pathname === "/") {
            if (login) {
              response.writeHead(403, { "content-type": "text/html; charset=utf-8" })
                .end(`<meta charset="utf-8"><title>승인 대기</title><body style="background:#0d1117;color:#c9d1d9;font:16px system-ui;padding:40px"><h2>GitHub @${login.replace(/[<>&"']/g, "")}</h2><p>MultiAgent 앱에서 원격 접속 요청을 승인해 주세요.</p></body>`);
            } else {
              response.writeHead(302, { location: "/auth/github" }).end();
            }
          } else sendJson(response, 401, { error: "unauthorized", pending: Boolean(login) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/state") {
          const runtime = this.stateProvider?.() ?? {};
          sendJson(response, 200, { title: "MultiAgent Remote", remote: true, agents: this.agents, view: this.view, ...runtime });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/input") {
          const body = await readJson(request);
          this.writePty?.(String(body.id || ""), String(body.data || ""));
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "GET" && url.pathname === "/") {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          response.end(DASHBOARD_HTML);
          return;
        }
        response.writeHead(404).end();
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
    });
    this.port = await listen(this.server, Number(this.config.server_port) || 18800);
    return this.status();
  }

  async stop() {
    const server = this.server; this.server = null; this.port = null;
    if (server) await new Promise((resolve) => server.close(resolve));
    return this.status();
  }
}

export class TunnelService {
  constructor({ baseDir, getConfig, getLocalUrl }) {
    this.baseDir = baseDir;
    this.getConfig = getConfig;
    this.getLocalUrl = getLocalUrl;
    this.child = null;
    this.publicUrl = null;
  }
  status() { return { running: Boolean(this.child && !this.child.killed), publicUrl: this.publicUrl }; }
  async start() {
    if (this.child && !this.child.killed) return this.status();
    const config = this.getConfig();
    const executable = path.join(this.baseDir, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
    if (!fs.existsSync(executable)) throw new Error("cloudflared 실행 파일을 찾을 수 없습니다.");
    const args = config.tunnel_token
      ? ["tunnel", "run", "--token", config.tunnel_token]
      : ["tunnel", "--url", this.getLocalUrl()];
    this.child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    this.publicUrl = config.public_hostname ? `https://${config.public_hostname}` : null;
    const inspect = (chunk) => {
      const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) this.publicUrl = match[0];
    };
    this.child.stdout.on("data", inspect); this.child.stderr.on("data", inspect);
    this.child.once("exit", () => { this.child = null; });
    return this.status();
  }
  async stop() {
    if (this.child) this.child.kill();
    this.child = null; this.publicUrl = null;
    return this.status();
  }
}
