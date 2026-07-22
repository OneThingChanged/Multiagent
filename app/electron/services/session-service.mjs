import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MAX_META_BYTES = 512 * 1024;
const MAX_TRANSCRIPTS = 10_000;

function normalizePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let resolved = path.resolve(value.trim()).replace(/[\\/]+$/, "");
  if (process.platform === "win32") resolved = resolved.toLowerCase();
  return resolved;
}

function sameFolder(left, right) {
  const a = normalizePath(left);
  const b = normalizePath(right);
  return Boolean(a && b && a === b);
}

async function walkJsonl(root, output) {
  if (!root || output.length >= MAX_TRANSCRIPTS) return;
  let entries;
  try {
    entries = await fsPromises.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (output.length >= MAX_TRANSCRIPTS) return;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) await walkJsonl(absolute, output);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")) {
      try {
        const stat = await fsPromises.stat(absolute);
        output.push({ path: absolute, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // A transcript may disappear while a CLI rotates it.
      }
    }
  }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
}

async function readMetadata(file, aiToolId) {
  let handle;
  try {
    handle = await fsPromises.open(file.path, "r");
    const length = Math.min(file.size, MAX_META_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/);
    let sessionId = path.basename(file.path).match(UUID_RE)?.[0] ?? null;
    let cwd = null;
    let events = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        continue;
      }
      events += 1;
      const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
      sessionId ??= firstString(
        item.session_id,
        item.sessionId,
        item.id && item.type === "session_meta" ? item.id : null,
        payload.session_id,
        payload.sessionId,
        payload.id && item.type === "session_meta" ? payload.id : null
      );
      cwd ??= firstString(item.cwd, payload.cwd, item.project_path, payload.project_path);
      if (sessionId && cwd) break;
    }
    return { aiToolId, sessionId, cwd, transcriptPath: file.path, events };
  } catch {
    return { aiToolId, sessionId: null, cwd: null, transcriptPath: file.path, events: 0 };
  } finally {
    await handle?.close().catch(() => {});
  }
}

export class SessionService {
  constructor(storageDir) {
    this.storageDir = storageDir;
    this.indexPath = path.join(storageDir, "electron-session-index.json");
    this.notes = new Map();
    this.scanCache = { at: 0, entries: [] };
    this.loadNotes();
  }

  loadNotes() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, "utf8"));
      for (const [agentId, note] of Object.entries(parsed)) {
        if (note && typeof note === "object") this.notes.set(agentId, note);
      }
    } catch {
      // First run or a partially written optional cache.
    }
  }

  async persistNotes() {
    await fsPromises.mkdir(this.storageDir, { recursive: true });
    const body = JSON.stringify(Object.fromEntries(this.notes), null, 2);
    const temp = `${this.indexPath}.${process.pid}.tmp`;
    await fsPromises.writeFile(temp, body, "utf8");
    await fsPromises.rename(temp, this.indexPath);
  }

  async noteHook({ id, event, session_id, transcript_path, cwd }) {
    if (!id || !session_id || event !== "session-start") return;
    this.notes.set(id, {
      sessionId: session_id,
      transcriptPath: transcript_path || null,
      cwd: cwd || null,
      updatedAt: Date.now(),
    });
    await this.persistNotes().catch(() => {});
    this.scanCache.at = 0;
  }

  transcriptRoots(aiToolId) {
    if (aiToolId === "codex") return [path.join(os.homedir(), ".codex", "sessions")];
    if (aiToolId === "claude") return [path.join(os.homedir(), ".claude", "projects")];
    return [];
  }

  async scan(aiToolId, force = false) {
    const cacheKey = `${aiToolId}:${this.transcriptRoots(aiToolId).join("|")}`;
    if (!force && this.scanCache.key === cacheKey && Date.now() - this.scanCache.at < 15_000) {
      return this.scanCache.entries;
    }
    const files = [];
    for (const root of this.transcriptRoots(aiToolId)) await walkJsonl(root, files);
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const entries = [];
    for (const file of files) entries.push({ ...(await readMetadata(file, aiToolId)), ...file });
    this.scanCache = { key: cacheKey, at: Date.now(), entries };
    return entries;
  }

  async resolve({ aiToolId, folder, preferredSessionId, agentId = null }) {
    const tool = String(aiToolId || "").toLowerCase();
    if (tool !== "codex" && tool !== "claude") return null;
    const preferred = String(preferredSessionId || "").trim();
    if (agentId && preferred) {
      const note = this.notes.get(agentId);
      if (note?.sessionId === preferred && (!note.cwd || sameFolder(note.cwd, folder))) return preferred;
    }
    const entries = await this.scan(tool);
    if (preferred) {
      const exact = entries.find(
        (entry) =>
          entry.sessionId?.toLowerCase() === preferred.toLowerCase() &&
          (!entry.cwd || !folder || sameFolder(entry.cwd, folder))
      );
      if (exact) return exact.sessionId;
    }
    const latest = entries.find((entry) => entry.sessionId && folder && sameFolder(entry.cwd, folder));
    return latest?.sessionId ?? null;
  }

  // Resolve the transcript file path for a session by preferred id or, failing
  // that, the most recent transcript for the given working folder. Used by the
  // chat view when no hook reported the transcript path (e.g. after a restart).
  async resolveTranscript({ aiToolId, folder, preferredSessionId }) {
    const tool = String(aiToolId || "").toLowerCase();
    if (tool !== "codex" && tool !== "claude") return null;
    const entries = await this.scan(tool);
    const preferred = String(preferredSessionId || "").trim().toLowerCase();
    if (preferred) {
      const exact = entries.find(
        (entry) => entry.transcriptPath && entry.sessionId?.toLowerCase() === preferred
      );
      if (exact) return exact.transcriptPath;
    }
    const byFolder = entries.find(
      (entry) => entry.transcriptPath && folder && sameFolder(entry.cwd, folder)
    );
    return byFolder?.transcriptPath ?? null;
  }

  async ingest(aiToolId = null) {
    const tools = aiToolId ? [aiToolId] : ["codex", "claude"];
    const errors = [];
    let files = 0;
    let events = 0;
    for (const tool of tools) {
      try {
        const entries = await this.scan(tool, true);
        files += entries.length;
        events += entries.reduce((sum, entry) => sum + (entry.events || 0), 0);
      } catch (error) {
        errors.push(`${tool}: ${String(error)}`);
      }
    }
    return { files, events, errors };
  }
}

