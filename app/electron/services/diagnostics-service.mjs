import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_LOG_BYTES = 64 * 1024;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactDiagnosticText(value, homeDir = os.homedir()) {
  let text = String(value ?? "");
  if (homeDir) {
    text = text.replace(new RegExp(escapeRegExp(homeDir), "gi"), "$HOME");
  }
  return text
    .replace(
      /\b(token|access[_-]?token|api[_-]?key|client[_-]?secret|password)\s*[:=]\s*([^\s,;]+)/gi,
      "$1=[REDACTED]"
    )
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+\/-]+/gi, "$1 [REDACTED]")
    .replace(/\b(gh[opurs]_[A-Za-z0-9]{20,})\b/g, "[REDACTED]");
}

export function sanitizeDiagnostics(value, homeDir = os.homedir()) {
  if (typeof value === "string") return redactDiagnosticText(value, homeDir);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiagnostics(item, homeDir));
  }
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(token|password|secret|client_secret|tunnel_token)$/i.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = sanitizeDiagnostics(item, homeDir);
    }
  }
  return output;
}

async function readLogTail(filePath, homeDir) {
  try {
    const stat = await fsPromises.stat(filePath);
    const start = Math.max(0, stat.size - MAX_LOG_BYTES);
    const handle = await fsPromises.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return redactDiagnosticText(buffer.toString("utf8"), homeDir);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export class DiagnosticsService {
  constructor({
    baseDir,
    homeDir = os.homedir(),
    appInfoProvider,
    terminalProvider,
    hookProvider,
    updaterProvider,
  }) {
    this.baseDir = baseDir;
    this.homeDir = homeDir;
    this.appInfoProvider = appInfoProvider;
    this.terminalProvider = terminalProvider;
    this.hookProvider = hookProvider;
    this.updaterProvider = updaterProvider;
  }

  async collect() {
    const raw = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      app: await this.appInfoProvider(),
      runtime: {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        node: process.versions.node,
        electron: process.versions.electron ?? null,
        chrome: process.versions.chrome ?? null,
      },
      terminals: await this.terminalProvider(),
      hooks: await this.hookProvider(),
      updater: await this.updaterProvider(),
      logs: {
        hook: await readLogTail(path.join(this.baseDir, "hook.log"), this.homeDir),
        updater: await readLogTail(
          path.join(this.baseDir, "electron-updater.log"),
          this.homeDir
        ),
      },
    };
    return sanitizeDiagnostics(raw, this.homeDir);
  }

  async exportTo(filePath) {
    const target = path.resolve(filePath);
    const bundle = await this.collect();
    await fsPromises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await fsPromises.writeFile(temporary, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    try {
      await fsPromises.rename(temporary, target);
    } catch {
      await fsPromises.writeFile(target, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
      await fsPromises.rm(temporary, { force: true }).catch(() => {});
    }
    return {
      path: target,
      terminalCount: Array.isArray(bundle.terminals) ? bundle.terminals.length : 0,
      hookHealthy: Boolean(bundle.hooks?.healthy),
    };
  }
}

export const diagnosticsInternals = { readLogTail };
