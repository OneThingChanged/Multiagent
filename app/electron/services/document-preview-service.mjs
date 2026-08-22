import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";

// Desktop HTML documents are rendered in an isolated Electron browser view,
// not in the trusted MultiAgent renderer.  The preview server deliberately
// exposes only a short-lived, project-scoped capability URL.
const PREVIEW_TTL_MS = 15 * 60_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SKIPPED_DIRS = new Set([
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
const SENSITIVE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
]);
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const PREVIEW_CSP = [
  "default-src 'self' data: blob:",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  // The browser view has a separate in-memory session and no Node bridge.
  // Keeping same-origin inside that isolated preview lets local reports load
  // relative JSON/data assets while the main application origin stays absent.
  "sandbox allow-scripts allow-same-origin allow-downloads",
].join("; ");

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeRelativePath(value) {
  const raw = String(value || "").trim().replaceAll("\\", "/");
  if (!raw || raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) return null;
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return null;
  }
  return normalized;
}

function isSafeRelativePath(relativePath) {
  const segments = relativePath.split("/");
  return segments.every((segment) => {
    if (!segment || segment === "." || segment === "..") return false;
    if (SKIPPED_DIRS.has(segment.toLowerCase())) return false;
    if (SENSITIVE_NAMES.has(segment.toLowerCase())) return false;
    return !segment.toLowerCase().startsWith(".env.");
  });
}

function encodeRelativePath(relativePath) {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}

function parsePreviewPath(pathname) {
  const match = /^\/preview\/([^/]+)\/(.+)$/.exec(pathname);
  if (!match || !TOKEN_PATTERN.test(match[1])) return null;
  try {
    const relativePath = match[2].split("/").map(decodeURIComponent).join("/");
    const normalized = normalizeRelativePath(relativePath);
    return normalized && isSafeRelativePath(normalized)
      ? { token: match[1], relativePath: normalized }
      : null;
  } catch {
    return null;
  }
}

function sendError(response, status, message) {
  const body = Buffer.from(`${message}\n`, "utf8");
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function responseHeaders(contentType, size, isHtml) {
  return {
    "content-type": contentType,
    "content-length": size,
    "cache-control": "no-store",
    "content-security-policy": isHtml ? PREVIEW_CSP : "default-src 'none'; sandbox",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

export class DocumentPreviewService {
  constructor({ ttlMs = PREVIEW_TTL_MS, maxHtmlBytes = MAX_HTML_BYTES } = {}) {
    this.ttlMs = ttlMs;
    this.maxHtmlBytes = maxHtmlBytes;
    this.server = null;
    this.port = null;
    this.entries = new Map();
  }

  status() {
    return {
      running: Boolean(this.server?.listening),
      port: this.port,
      previews: this.entries.size,
    };
  }

  prune(now = Date.now()) {
    for (const [token, entry] of this.entries) {
      if (!entry || entry.expiresAt <= now) this.entries.delete(token);
    }
  }

  async start() {
    if (this.server?.listening) return this.status();
    this.server = http.createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        if (!response.headersSent) sendError(response, 500, "문서 미리보기를 불러오지 못했습니다.");
        else response.destroy(error);
      });
    });
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server?.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server?.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(0, "127.0.0.1");
    });
    this.port = this.server.address()?.port ?? null;
    if (!this.port) throw new Error("문서 미리보기 서버 포트를 확인하지 못했습니다.");
    return this.status();
  }

  async issue({ folder, relativePath }) {
    const root = fs.realpathSync(String(folder || ""));
    if (!fs.statSync(root).isDirectory()) throw new Error("프로젝트 폴더가 아닙니다.");
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized || !isSafeRelativePath(normalized)) {
      throw new Error("허용되지 않는 HTML 경로입니다.");
    }
    const resolved = fs.realpathSync(path.resolve(root, normalized));
    if (!isInside(root, resolved)) throw new Error("프로젝트 밖의 파일은 열 수 없습니다.");
    const extension = path.extname(resolved).toLowerCase();
    if (!HTML_EXTENSIONS.has(extension)) throw new Error("HTML 파일만 전용 브라우저에서 열 수 있습니다.");
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) throw new Error("HTML 파일을 찾을 수 없습니다.");
    if (stats.size > this.maxHtmlBytes) throw new Error("HTML 문서는 2MB 이하여야 합니다.");
    await this.start();
    this.prune();
    const token = crypto.randomBytes(32).toString("base64url");
    this.entries.set(token, {
      root,
      expiresAt: Date.now() + this.ttlMs,
    });
    return {
      token,
      url: `http://127.0.0.1:${this.port}/preview/${token}/${encodeRelativePath(normalized)}`,
      relativePath: normalized,
      expiresAt: Date.now() + this.ttlMs,
    };
  }

  release(token) {
    if (TOKEN_PATTERN.test(String(token || ""))) this.entries.delete(token);
  }

  isPreviewUrl(rawUrl, browserToken = null) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== String(this.port)) {
        return false;
      }
      const parsed = parsePreviewPath(url.pathname);
      if (!parsed) return false;
      if (browserToken && parsed.token !== browserToken) return false;
      const entry = this.entries.get(parsed.token);
      return Boolean(entry && entry.expiresAt > Date.now());
    } catch {
      return false;
    }
  }

  async handle(request, response) {
    if (!["GET", "HEAD"].includes(request.method)) {
      sendError(response, 405, "GET 요청만 지원합니다.");
      return;
    }
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const parsed = parsePreviewPath(url.pathname);
    if (!parsed) {
      sendError(response, 404, "미리보기 경로를 찾을 수 없습니다.");
      return;
    }
    this.prune();
    const entry = this.entries.get(parsed.token);
    if (!entry || entry.expiresAt <= Date.now()) {
      sendError(response, 404, "미리보기 권한이 만료되었습니다.");
      return;
    }
    const resolved = path.resolve(entry.root, parsed.relativePath);
    if (!isInside(entry.root, resolved) || !isSafeRelativePath(parsed.relativePath)) {
      sendError(response, 403, "프로젝트 밖의 파일은 열 수 없습니다.");
      return;
    }
    let realPath;
    let stats;
    try {
      // Keep the same Windows path canonicalization implementation for the
      // root and child. fs.promises.realpath can expand an 8.3 user path while
      // realpathSync preserves it, which would make a valid child look
      // outside the project during containment checks.
      realPath = fs.realpathSync(resolved);
      stats = fs.statSync(realPath);
    } catch {
      sendError(response, 404, "미리보기 파일을 찾을 수 없습니다.");
      return;
    }
    if (!isInside(entry.root, realPath) || !stats.isFile()) {
      sendError(response, 403, "허용되지 않는 파일입니다.");
      return;
    }
    const extension = path.extname(realPath).toLowerCase();
    const contentType = MIME_TYPES.get(extension);
    if (!contentType) {
      sendError(response, 415, "지원하지 않는 HTML 자산입니다.");
      return;
    }
    response.writeHead(200, responseHeaders(contentType, stats.size, HTML_EXTENSIONS.has(extension)));
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    await pipeline(fs.createReadStream(realPath), response);
  }

  async close() {
    this.entries.clear();
    const server = this.server;
    this.server = null;
    this.port = null;
    if (!server) return;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

export const documentPreviewInternals = {
  normalizeRelativePath,
  parsePreviewPath,
  isSafeRelativePath,
};
