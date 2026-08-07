import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { RemotePushService } from "./remote-push-service.mjs";

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
const REMOTE_MOBILE_APK_URL = "/downloads/MultiAgent-Mobile.apk";
const DEFAULT_REMOTE_MOBILE_APK_PATH = path.join(
  REMOTE_PWA_DIR,
  "downloads",
  "MultiAgent-Mobile.apk",
);
const REMOTE_DOCUMENT_EXTENSIONS = new Map([
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".html", "html"],
  [".htm", "html"],
]);
const REMOTE_DOCUMENT_SKIPPED_DIRS = new Set([
  ".build-tools",
  ".cache",
  ".claude",
  ".codex",
  ".git",
  ".next",
  ".qwen",
  ".tmp",
  ".venv",
  "__pycache__",
  "build",
  "dist",
  "node_modules",
  "out",
  "target",
]);
const MAX_REMOTE_DOCUMENT_FILES = 500;
const MAX_REMOTE_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;
const REMOTE_IMAGE_EXTENSIONS = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);
const REMOTE_PREVIEW_ASSET_EXTENSIONS = new Map([
  ...REMOTE_IMAGE_EXTENSIONS,
  [".css", "text/css; charset=utf-8"],
]);
const MAX_REMOTE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_ATTACHMENT_REQUEST_BYTES = 12 * 1024 * 1024;
const REMOTE_ATTACHMENT_TYPES = new Map([
  ["image/png", { extension: ".png", signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) }],
  ["image/jpeg", { extension: ".jpg", signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff }],
  ["image/gif", { extension: ".gif", signature: (buffer) => ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii")) }],
  ["image/webp", { extension: ".webp", signature: (buffer) => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" }],
  ["image/bmp", { extension: ".bmp", signature: (buffer) => buffer.subarray(0, 2).toString("ascii") === "BM" }],
]);
const REMOTE_PWA_ASSETS = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/login", { file: "login.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/pwa/styles.css", { file: "styles.css", type: "text/css; charset=utf-8", cache: "no-cache" }],
  ["/pwa/terminal-touch.js", { file: "terminal-touch.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
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
  "img-src 'self' data: blob:",
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

function remoteMobileApkInfo(apkPath) {
  try {
    const stats = fs.statSync(apkPath);
    if (!stats.isFile() || stats.size <= 0) return { available: false };
    return {
      available: true,
      downloadUrl: REMOTE_MOBILE_APK_URL,
      filename: path.basename(apkPath),
      size: stats.size,
      architecture: "arm64-v8a",
      minAndroidApi: 24,
    };
  } catch {
    return { available: false };
  }
}

function parseSingleByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value || "").trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function sendRemoteMobileApk(request, response, apkPath) {
  const info = remoteMobileApkInfo(apkPath);
  if (!info.available) {
    sendJson(response, 404, { error: "Android APK is not available" });
    return;
  }
  const stats = fs.statSync(apkPath);
  const rangeHeader = String(request.headers.range || "").trim();
  const range = rangeHeader ? parseSingleByteRange(rangeHeader, stats.size) : null;
  if (rangeHeader && !range) {
    response.writeHead(416, {
      "content-range": `bytes */${stats.size}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    }).end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? stats.size - 1;
  response.writeHead(range ? 206 : 200, {
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-disposition": 'attachment; filename="MultiAgent-Mobile.apk"',
    "content-length": end - start + 1,
    "content-type": "application/vnd.android.package-archive",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
    ...(range ? { "content-range": `bytes ${start}-${end}/${stats.size}` } : {}),
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = fs.createReadStream(apkPath, { start, end });
  stream.on("error", (error) => response.destroy(error));
  response.once("close", () => stream.destroy());
  stream.pipe(response);
}

// SSE stream of raw filtered PTY output for an xterm client. Shared by the
// Remote server and the local Dashboard so both mirror the desktop terminal.
function streamTerminalResponse(request, response, id, providers) {
  const snapshot = providers.terminalSnapshot?.(id, 0);
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
  const size = providers.terminalSize?.(id) || null;
  send("reset", { data: snapshot.data, cols: size?.cols || null, rows: size?.rows || null });
  unsubscribe = providers.subscribeTerminal?.(id, {
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

class RemoteDocumentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function documentProjects(snapshot) {
  const viewProjects = snapshot?.view?.projects;
  if (Array.isArray(viewProjects)) return viewProjects;
  return Array.isArray(snapshot?.projects) ? snapshot.projects : [];
}

function documentAgents(snapshot) {
  const liveAgents = Array.isArray(snapshot?.agents) ? snapshot.agents : [];
  const viewAgents = Array.isArray(snapshot?.view?.agents) ? snapshot.view.agents : [];
  const merged = new Map();
  for (const agent of liveAgents) {
    const id = String(agent?.id || "").trim();
    if (id) merged.set(id, agent);
  }
  for (const agent of viewAgents) {
    const id = String(agent?.id || "").trim();
    if (!id) continue;
    merged.set(id, { ...(merged.get(id) || {}), ...agent });
  }
  return [...merged.values()];
}

function documentProjectRoot(snapshot, projectId, agentId = null) {
  const id = String(projectId || "").trim();
  const project = documentProjects(snapshot).find((candidate) => String(candidate?.id || "") === id);
  if (!project) throw new RemoteDocumentError(404, "프로젝트를 찾을 수 없습니다.");
  if (project.sshHostId) {
    throw new RemoteDocumentError(409, "SSH 프로젝트의 원격 파일 보기는 아직 지원하지 않습니다.");
  }
  const folder = String(project.folder || "").trim();
  if (!folder) throw new RemoteDocumentError(404, "프로젝트 폴더가 없습니다.");
  let root;
  try {
    root = fs.realpathSync(folder);
  } catch {
    throw new RemoteDocumentError(404, "프로젝트 폴더를 찾을 수 없습니다.");
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new RemoteDocumentError(404, "프로젝트 폴더를 찾을 수 없습니다.");
  }
  let baseRoot = root;
  const requestedAgentId = String(agentId || "").trim();
  if (requestedAgentId) {
    const agent = documentAgents(snapshot).find(
      (candidate) => String(candidate?.id || "") === requestedAgentId,
    );
    if (!agent || String(agent.projectId || "") !== id) {
      throw new RemoteDocumentError(404, "세션 작업 폴더를 찾을 수 없습니다.");
    }
    if (agent.sshHostId) {
      throw new RemoteDocumentError(409, "SSH 세션의 원격 파일 보기는 아직 지원하지 않습니다.");
    }
    const agentFolder = String(agent.folder || "").trim();
    if (agentFolder) {
      try {
        baseRoot = fs.realpathSync(agentFolder);
      } catch {
        throw new RemoteDocumentError(404, "세션 작업 폴더를 찾을 수 없습니다.");
      }
      if (!fs.statSync(baseRoot).isDirectory() || !isInsideDocumentRoot(root, baseRoot)) {
        throw new RemoteDocumentError(403, "세션 작업 폴더가 프로젝트 밖에 있습니다.");
      }
    }
  }
  return { project, root, baseRoot };
}

function isInsideDocumentRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function collectRemoteDocuments(root, directory, output) {
  if (output.length >= MAX_REMOTE_DOCUMENT_FILES) return;
  let entries;
  try {
    entries = await fsPromises.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (output.length >= MAX_REMOTE_DOCUMENT_FILES) return;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!REMOTE_DOCUMENT_SKIPPED_DIRS.has(entry.name.toLowerCase())) {
        await collectRemoteDocuments(root, absolute, output);
      }
      continue;
    }
    // Deliberately ignore symbolic links so a project cannot expose a file
    // outside its root through an otherwise harmless-looking docs path.
    if (!entry.isFile()) continue;
    const kind = REMOTE_DOCUMENT_EXTENSIONS.get(path.extname(entry.name).toLowerCase());
    if (!kind) continue;
    output.push({
      name: entry.name,
      path: path.relative(root, absolute).split(path.sep).join("/"),
      kind,
    });
  }
}

async function listRemoteDocuments(snapshot, projectId) {
  const { project, root } = documentProjectRoot(snapshot, projectId);
  const documents = [];
  await collectRemoteDocuments(root, root, documents);
  return {
    project: { id: project.id, name: project.name },
    documents,
    limit: MAX_REMOTE_DOCUMENT_FILES,
    truncated: documents.length >= MAX_REMOTE_DOCUMENT_FILES,
  };
}

async function resolveRemoteProjectFile(snapshot, projectId, requestedPath, agentId = null) {
  const { project, root, baseRoot } = documentProjectRoot(snapshot, projectId, agentId);
  const raw = String(requestedPath || "").trim().replaceAll("\\", "/");
  if (!raw) throw new RemoteDocumentError(400, "올바른 파일 경로가 필요합니다.");
  const absolute = path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw);
  const candidate = absolute ? path.resolve(raw) : path.resolve(baseRoot, ...raw.split("/"));
  if (!isInsideDocumentRoot(root, candidate)) {
    throw new RemoteDocumentError(403, "프로젝트 밖의 파일은 열 수 없습니다.");
  }
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    throw new RemoteDocumentError(404, "문서 파일을 찾을 수 없습니다.");
  }
  if (!isInsideDocumentRoot(root, resolved)) {
    throw new RemoteDocumentError(403, "프로젝트 밖의 파일은 열 수 없습니다.");
  }
  const stats = await fsPromises.stat(resolved);
  if (!stats.isFile()) throw new RemoteDocumentError(404, "파일을 찾을 수 없습니다.");
  return { project, root, baseRoot, resolved, stats };
}

async function readRemoteDocument(snapshot, projectId, requestedPath, agentId = null) {
  const { project, root, baseRoot, resolved, stats } = await resolveRemoteProjectFile(
    snapshot,
    projectId,
    requestedPath,
    agentId,
  );
  const kind = REMOTE_DOCUMENT_EXTENSIONS.get(path.extname(resolved).toLowerCase());
  if (!kind) throw new RemoteDocumentError(415, "Markdown과 HTML 파일만 열 수 있습니다.");
  if (stats.size > MAX_REMOTE_DOCUMENT_BYTES) {
    throw new RemoteDocumentError(413, "2MB보다 큰 문서는 Remote에서 열 수 없습니다.");
  }
  return {
    project: { id: project.id, name: project.name },
    name: path.basename(resolved),
    path: path.relative(root, resolved).split(path.sep).join("/"),
    basePath: path.relative(baseRoot, resolved).split(path.sep).join("/"),
    kind,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    content: await fsPromises.readFile(resolved, "utf8"),
  };
}

async function sendRemoteImage(response, snapshot, projectId, requestedPath, agentId = null) {
  const { resolved, stats } = await resolveRemoteProjectFile(snapshot, projectId, requestedPath, agentId);
  const contentType = REMOTE_IMAGE_EXTENSIONS.get(path.extname(resolved).toLowerCase());
  if (!contentType) throw new RemoteDocumentError(415, "지원하지 않는 이미지 형식입니다.");
  if (stats.size > MAX_REMOTE_IMAGE_BYTES) {
    throw new RemoteDocumentError(413, "25MB보다 큰 이미지는 Remote에서 열 수 없습니다.");
  }
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": stats.size,
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; sandbox",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
  });
  await pipeline(fs.createReadStream(resolved), response);
}

async function sendRemotePreviewAsset(response, snapshot, projectId, requestedPath, agentId = null) {
  const { resolved, stats } = await resolveRemoteProjectFile(snapshot, projectId, requestedPath, agentId);
  const extension = path.extname(resolved).toLowerCase();
  const contentType = REMOTE_PREVIEW_ASSET_EXTENSIONS.get(extension);
  if (!contentType) throw new RemoteDocumentError(415, "지원하지 않는 HTML 자산 형식입니다.");
  const limit = extension === ".css" ? MAX_REMOTE_DOCUMENT_BYTES : MAX_REMOTE_IMAGE_BYTES;
  if (stats.size > limit) {
    throw new RemoteDocumentError(413, extension === ".css"
      ? "2MB보다 큰 스타일시트는 Remote에서 열 수 없습니다."
      : "25MB보다 큰 이미지는 Remote에서 열 수 없습니다.");
  }
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": stats.size,
    "cache-control": "no-store",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
  });
  await pipeline(fs.createReadStream(resolved), response);
}

function sendRemoteDocumentError(response, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  sendJson(response, status, { error: error?.message || "문서를 불러오지 못했습니다." });
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

async function saveRemoteAttachment(request, baseDir) {
  let body;
  try {
    body = await readJson(request, MAX_REMOTE_ATTACHMENT_REQUEST_BYTES);
  } catch (error) {
    if (error?.message === "request too large") {
      throw new RemoteDocumentError(413, "이미지는 8MB 이하여야 합니다.");
    }
    throw new RemoteDocumentError(400, "올바른 이미지 요청이 아닙니다.");
  }
  const id = String(body.id || "").trim();
  const declaredType = String(body.type || "").trim().toLowerCase();
  const match = String(body.data || "").match(/^data:([^;,]+);base64,([a-z0-9+/]+={0,2})$/i);
  const mime = String(match?.[1] || "").toLowerCase();
  const encoded = match?.[2] || "";
  const imageType = REMOTE_ATTACHMENT_TYPES.get(mime);
  if (!id || !imageType || declaredType !== mime || encoded.length % 4 !== 0) {
    throw new RemoteDocumentError(415, "PNG, JPEG, GIF, WebP, BMP 이미지만 첨부할 수 있습니다.");
  }
  const content = Buffer.from(encoded, "base64");
  if (!content.length || content.length > MAX_REMOTE_ATTACHMENT_BYTES) {
    throw new RemoteDocumentError(413, "이미지는 8MB 이하여야 합니다.");
  }
  if (!imageType.signature(content)) {
    throw new RemoteDocumentError(415, "파일 내용이 선택한 이미지 형식과 일치하지 않습니다.");
  }
  const directory = path.join(baseDir, "remote-attachments");
  await fsPromises.mkdir(directory, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomUUID()}${imageType.extension}`;
  const storedPath = path.join(directory, storedName);
  await fsPromises.writeFile(storedPath, content, { flag: "wx" });
  return {
    path: storedPath,
    name: path.basename(String(body.name || "").trim()).slice(0, 160) || storedName,
    type: mime,
    size: content.length,
  };
}

function sendRemoteAttachmentError(response, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  sendJson(response, status, { error: error?.message || "이미지를 첨부하지 못했습니다." });
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
  constructor({ title, defaultPort, baseDir, configName, stateProvider, providers = null }) {
    this.title = title;
    this.defaultPort = defaultPort;
    this.baseDir = baseDir;
    this.configPath = path.join(baseDir, configName);
    this.stateProvider = stateProvider;
    // When provided, the dashboard serves the full Remote PWA (chat/terminal/
    // input) on loopback instead of the minimal card grid.
    this.providers = providers;
    this.state = {};
    this.server = null;
    this.port = null;
    this.usageRefreshAt = 0;
    this.config = { enabled: false, serverPort: defaultPort };
    this.loadConfig();
  }

  isLocalOrigin(request) {
    if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") {
      return false;
    }
    const origin = String(request.headers.origin || "").trim().toLowerCase();
    if (!origin) return true;
    const forwardedHost = String(
      request.headers["x-forwarded-host"] || request.headers.host || ""
    )
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (!forwardedHost) return false;
    return new Set([
      `http://${forwardedHost}`,
      `https://${forwardedHost}`,
    ]).has(origin);
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
    const p = this.providers;
    this.server = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (request.method === "GET" && url.pathname === "/api/state") {
          sendJson(response, 200, this.snapshot());
          return;
        }
        if (p) {
          // Full Remote PWA on loopback (no login needed locally).
          if (request.method === "GET" && url.pathname === "/api/usage") {
            const refreshRequested = url.searchParams.get("refresh") === "1";
            const refresh = refreshRequested && Date.now() - this.usageRefreshAt >= 30_000;
            if (refresh) this.usageRefreshAt = Date.now();
            try {
              const usage = await p.usageProvider?.(refresh);
              sendJson(response, 200, usage ?? { updatedAt: 0, limits: [], tokens: {} });
            } catch (error) {
              sendJson(response, 500, {
                error: error?.message || "usage unavailable",
                updatedAt: 0,
                limits: [],
                tokens: {},
              });
            }
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/input") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            const body = await readJson(request);
            const id = String(body.id || "").trim();
            const data = String(body.data || "");
            if (!id || !data || data.length > 8 * 1024) { sendJson(response, 400, { error: "invalid input" }); return; }
            if (p.writePty?.(id, data) === false) {
              sendJson(response, 409, { error: "session is not active" });
              return;
            }
            sendJson(response, 200, { ok: true });
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/attachment") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
              sendJson(response, 415, { error: "application/json required" });
              return;
            }
            try {
              sendJson(response, 201, await saveRemoteAttachment(request, this.baseDir));
            } catch (error) {
              sendRemoteAttachmentError(response, error);
            }
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/session/restart") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            const body = await readJson(request);
            const id = String(body.id || "").trim();
            if (!id) { sendJson(response, 400, { error: "invalid session id" }); return; }
            p.restartSession?.(id);
            sendJson(response, 200, { ok: true });
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/session/cancel") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            const body = await readJson(request);
            const id = String(body.id || "").trim();
            if (!id) { sendJson(response, 400, { error: "invalid session id" }); return; }
            if (p.cancelSession?.(id) === false) {
              sendJson(response, 409, { error: "session is not active" });
              return;
            }
            sendJson(response, 200, { ok: true, status: "idle" });
            return;
          }
          if (request.method === "GET" && url.pathname === "/api/chat") {
            const id = String(url.searchParams.get("id") || "").trim();
            try {
              sendJson(response, 200, (await p.chatProvider?.(id)) ?? { blocks: [], missing: true });
            } catch (error) {
              sendJson(response, 500, { error: error.message, blocks: [] });
            }
            return;
          }
          if (request.method === "GET" && url.pathname === "/api/stream") {
            streamTerminalResponse(request, response, String(url.searchParams.get("id") || "").trim(), p);
            return;
          }
          if (request.method === "GET" && url.pathname === "/api/docs") {
            try {
              sendJson(response, 200, await listRemoteDocuments(this.snapshot(), url.searchParams.get("projectId")));
            } catch (error) {
              sendRemoteDocumentError(response, error);
            }
            return;
          }
          if (request.method === "GET" && url.pathname === "/api/docs/read") {
            try {
              sendJson(response, 200, await readRemoteDocument(
                this.snapshot(),
                url.searchParams.get("projectId"),
                url.searchParams.get("path"),
                url.searchParams.get("agentId"),
              ));
            } catch (error) {
              sendRemoteDocumentError(response, error);
            }
            return;
          }
          if (request.method === "GET" && url.pathname === "/api/files/image") {
            try {
              await sendRemoteImage(
                response,
                this.snapshot(),
                url.searchParams.get("projectId"),
                url.searchParams.get("path"),
                url.searchParams.get("agentId"),
              );
            } catch (error) {
              if (!response.headersSent) sendRemoteDocumentError(response, error);
              else response.destroy(error);
            }
            return;
          }
          if (request.method === "GET" && url.pathname === "/api/files/asset") {
            try {
              await sendRemotePreviewAsset(
                response,
                this.snapshot(),
                url.searchParams.get("projectId"),
                url.searchParams.get("path"),
                url.searchParams.get("agentId"),
              );
            } catch (error) {
              if (!response.headersSent) sendRemoteDocumentError(response, error);
              else response.destroy(error);
            }
            return;
          }
          // The PWA shell + assets (index at "/", app.js, xterm, styles, sw…).
          if (request.method === "GET" && sendRemoteAsset(response, url.pathname)) return;
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
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
    });
    this.port = await listen(this.server, this.config.serverPort);
    return this.status();
  }

  async stop() {
    const server = this.server;
    this.server = null;
    this.port = null;
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    return this.status();
  }
}

export class RemoteDashboardService {
  constructor({ baseDir, stateProvider, writePty, requestAccess, fetchImpl = fetch, terminalSnapshot, subscribeTerminal, terminalSize, chatProvider, restartSession, cancelSession, usageProvider, mobileApkPath = DEFAULT_REMOTE_MOBILE_APK_PATH, pushService = null }) {
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
    this.restartSession = restartSession ?? (() => false);
    this.cancelSession = cancelSession ?? (() => false);
    this.usageProvider = usageProvider ?? (() => ({ updatedAt: 0, limits: [], tokens: {} }));
    this.usageRefreshAt = 0;
    this.mobileApkPath = mobileApkPath;
    this.pushService = pushService ?? new RemotePushService({ baseDir });
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
    const previousOwner = String(this.config.owner || "").trim();
    this.config = { ...this.config, ...config };
    await this.save(this.configPath, this.config);
    const nextOwner = String(this.config.owner || "").trim();
    if (
      previousOwner &&
      previousOwner.toLowerCase() !== nextOwner.toLowerCase() &&
      !this.access.approved.some((value) => value.toLowerCase() === previousOwner.toLowerCase())
    ) {
      this.pushService.removeLogin(previousOwner);
    }
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
    this.pushService.removeLogin(login);
    return this.accessList();
  }

  notifyAgentDone(payload) {
    if (payload?.event !== "done" || !payload?.id) return Promise.resolve(null);
    const agent = this.agents.find((entry) => entry.id === payload.id) ?? null;
    const viewAgent = Array.isArray(this.view?.agents)
      ? this.view.agents.find((entry) => entry.id === payload.id)
      : null;
    const project = Array.isArray(this.view?.projects)
      ? this.view.projects.find((entry) => entry.id === viewAgent?.projectId)
      : null;
    const projectName = String(
      agent?.project || agent?.projectName || project?.name || "MultiAgent",
    ).trim();
    const agentName = String(agent?.name || payload.id).trim();
    return this.pushService.notifyDone({
      agentId: payload.id,
      sessionId: payload.session_id,
      title: `${projectName} / ${agentName}`,
    });
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
    streamTerminalResponse(request, response, id, {
      terminalSnapshot: this.terminalSnapshot,
      subscribeTerminal: this.subscribeTerminal,
      terminalSize: this.terminalSize,
    });
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
        if (
          ["GET", "HEAD"].includes(request.method) &&
          url.pathname === REMOTE_MOBILE_APK_URL
        ) {
          sendRemoteMobileApk(request, response, this.mobileApkPath);
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/push/public-key") {
          sendJson(response, 200, {
            supported: true,
            publicKey: this.pushService.publicKey(),
          });
          return;
        }
        if (
          ["POST", "DELETE"].includes(request.method) &&
          url.pathname === "/api/push/subscription"
        ) {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          const pushLogin = login || (this.isDirectLocal(request) ? "__local__" : "");
          if (!pushLogin) {
            sendJson(response, 401, { error: "authenticated login required" });
            return;
          }
          try {
            const body = await readJson(request);
            const result = request.method === "POST"
              ? this.pushService.subscribe(pushLogin, body)
              : this.pushService.unsubscribe(pushLogin, body.endpoint);
            sendJson(response, request.method === "POST" ? 201 : 200, result);
          } catch (error) {
            sendJson(response, 400, { error: error?.message || "invalid push subscription" });
          }
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
            mobileApp: remoteMobileApkInfo(this.mobileApkPath),
          });
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/usage") {
          const refreshRequested = url.searchParams.get("refresh") === "1";
          const refresh = refreshRequested && Date.now() - this.usageRefreshAt >= 30_000;
          if (refresh) this.usageRefreshAt = Date.now();
          try {
            const usage = await this.usageProvider(refresh);
            sendJson(response, 200, usage ?? { updatedAt: 0, limits: [], tokens: {} });
          } catch (error) {
            sendJson(response, 500, {
              error: error?.message || "usage limits unavailable",
              updatedAt: 0,
              limits: [],
              tokens: {},
            });
          }
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
        if (request.method === "POST" && url.pathname === "/api/attachment") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          try {
            sendJson(response, 201, await saveRemoteAttachment(request, this.baseDir));
          } catch (error) {
            sendRemoteAttachmentError(response, error);
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/stream") {
          this.streamTerminal(request, response, String(url.searchParams.get("id") || "").trim());
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/session/restart") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          const body = await readJson(request);
          const id = String(body.id || "").trim();
          if (!id) {
            sendJson(response, 400, { error: "invalid session id" });
            return;
          }
          this.restartSession?.(id);
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/session/cancel") {
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
          if (!id) {
            sendJson(response, 400, { error: "invalid session id" });
            return;
          }
          if (this.cancelSession?.(id) === false) {
            sendJson(response, 409, { error: "session is not active" });
            return;
          }
          sendJson(response, 200, { ok: true, status: "idle" });
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
        if (request.method === "GET" && url.pathname === "/api/docs") {
          try {
            sendJson(response, 200, await listRemoteDocuments(
              { agents: this.agents, view: this.view },
              url.searchParams.get("projectId"),
            ));
          } catch (error) {
            sendRemoteDocumentError(response, error);
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/docs/read") {
          try {
            sendJson(response, 200, await readRemoteDocument(
              { agents: this.agents, view: this.view },
              url.searchParams.get("projectId"),
              url.searchParams.get("path"),
              url.searchParams.get("agentId"),
            ));
          } catch (error) {
            sendRemoteDocumentError(response, error);
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/files/image") {
          try {
            await sendRemoteImage(
              response,
              { agents: this.agents, view: this.view },
              url.searchParams.get("projectId"),
              url.searchParams.get("path"),
              url.searchParams.get("agentId"),
            );
          } catch (error) {
            if (!response.headersSent) sendRemoteDocumentError(response, error);
            else response.destroy(error);
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/files/asset") {
          try {
            await sendRemotePreviewAsset(
              response,
              { agents: this.agents, view: this.view },
              url.searchParams.get("projectId"),
              url.searchParams.get("path"),
              url.searchParams.get("agentId"),
            );
          } catch (error) {
            if (!response.headersSent) sendRemoteDocumentError(response, error);
            else response.destroy(error);
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
