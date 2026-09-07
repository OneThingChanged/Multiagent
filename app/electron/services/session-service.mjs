import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MAX_META_BYTES = 512 * 1024;
const MAX_TRANSCRIPTS = 10_000;
const STORAGE_TOOLS = new Set(["codex", "claude"]);
const STORAGE_CATALOG_VERSION = 1;

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

function canonicalFilePath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return path.resolve(fs.realpathSync.native(value.trim()));
  } catch {
    return path.resolve(value.trim());
  }
}

function catalogKey(value) {
  return normalizePath(canonicalFilePath(value));
}

function transcriptTool(value) {
  const normalized = String(value || "").replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/.codex/sessions/")) return "codex";
  if (normalized.includes("/.claude/projects/")) return "claude";
  return null;
}

function isInsideRoot(candidate, root) {
  const normalizedCandidate = normalizePath(canonicalFilePath(candidate));
  const normalizedRoot = normalizePath(canonicalFilePath(root));
  if (!normalizedCandidate || !normalizedRoot) return false;
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  );
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
    this.catalogPath = path.join(storageDir, "session-storage-catalog.json");
    this.notes = new Map();
    this.catalog = new Map();
    this.catalogUpdatedAt = 0;
    this.catalogScannedTools = new Set();
    this.catalogPersistChain = Promise.resolve();
    this.scanCache = new Map();
    this.metadataCache = new Map();
    this.loadNotes();
    this.loadCatalog();
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

  loadCatalog() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.catalogPath, "utf8"));
      if (parsed?.version !== STORAGE_CATALOG_VERSION || !Array.isArray(parsed.entries)) return;
      for (const tool of Array.isArray(parsed.scannedTools) ? parsed.scannedTools : []) {
        if (STORAGE_TOOLS.has(tool)) this.catalogScannedTools.add(tool);
      }
      for (const candidate of parsed.entries) {
        const aiToolId = String(candidate?.aiToolId || "").toLowerCase();
        const sessionId = String(candidate?.sessionId || "").trim();
        const transcriptPath = canonicalFilePath(candidate?.transcriptPath);
        const key = catalogKey(transcriptPath);
        if (!STORAGE_TOOLS.has(aiToolId) || !sessionId || !transcriptPath || !key) continue;
        this.catalog.set(key, {
          aiToolId,
          sessionId,
          cwd: typeof candidate.cwd === "string" ? candidate.cwd : null,
          transcriptPath,
          path: transcriptPath,
          events: Number(candidate.events) || 0,
          size: Math.max(0, Number(candidate.size) || 0),
          mtimeMs: Math.max(0, Number(candidate.mtimeMs) || 0),
          lastSeenAt: Math.max(0, Number(candidate.lastSeenAt) || 0),
        });
      }
      this.catalogUpdatedAt = Math.max(0, Number(parsed.updatedAt) || 0);
    } catch {
      // First run, legacy release, or a partially written optional catalog.
    }
  }

  async persistCatalog() {
    const operation = async () => {
      await fsPromises.mkdir(this.storageDir, { recursive: true });
      this.catalogUpdatedAt = Date.now();
      const entries = [...this.catalog.values()]
        .map((entry) => ({
          aiToolId: entry.aiToolId,
          sessionId: entry.sessionId,
          cwd: entry.cwd,
          transcriptPath: entry.transcriptPath,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          events: entry.events || 0,
          lastSeenAt: entry.lastSeenAt || this.catalogUpdatedAt,
        }))
        .sort((left, right) => right.mtimeMs - left.mtimeMs);
      const body = JSON.stringify({
        version: STORAGE_CATALOG_VERSION,
        updatedAt: this.catalogUpdatedAt,
        scannedTools: [...this.catalogScannedTools].sort(),
        entries,
      }, null, 2);
      const temp = `${this.catalogPath}.${process.pid}.tmp`;
      await fsPromises.writeFile(temp, body, "utf8");
      await fsPromises.rename(temp, this.catalogPath);
    };
    this.catalogPersistChain = this.catalogPersistChain
      .catch(() => {})
      .then(operation);
    return this.catalogPersistChain;
  }

  async catalogHookTranscript({ event, session_id, transcript_path, cwd }) {
    if (
      (event !== "session-start" && event !== "done") ||
      !session_id ||
      !transcript_path
    ) {
      return false;
    }
    const aiToolId = transcriptTool(transcript_path);
    const transcriptPath = canonicalFilePath(transcript_path);
    const key = catalogKey(transcriptPath);
    if (!aiToolId || !transcriptPath || !key) return false;
    let stat;
    try {
      stat = await fsPromises.stat(transcriptPath);
    } catch {
      return false;
    }
    const existing = this.catalog.get(key);
    this.catalog.set(key, {
      aiToolId,
      sessionId: String(session_id).trim(),
      cwd: typeof cwd === "string" && cwd.trim() ? cwd : existing?.cwd ?? null,
      transcriptPath,
      path: transcriptPath,
      events: existing?.events || 0,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      lastSeenAt: Date.now(),
    });
    this.scanCache.clear();
    await this.persistCatalog();
    return true;
  }

  async noteHook({ id, event, session_id, transcript_path, cwd }) {
    await this.catalogHookTranscript({
      event,
      session_id,
      transcript_path,
      cwd,
    }).catch(() => {});
    if (!id || !session_id || event !== "session-start") return;
    this.notes.set(id, {
      sessionId: session_id,
      transcriptPath: transcript_path || null,
      cwd: cwd || null,
      updatedAt: Date.now(),
    });
    await this.persistNotes().catch(() => {});
    this.scanCache.clear();
  }

  transcriptRoots(aiToolId) {
    if (aiToolId === "codex") return this.codexRoots?.() ?? [path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions")];
    if (aiToolId === "claude") return [path.join(os.homedir(), ".claude", "projects")];
    return [];
  }

  async scan(aiToolId, force = false) {
    const roots = this.transcriptRoots(aiToolId);
    const cacheKey = `${aiToolId}:${roots.join("|")}`;
    const cachedScan = this.scanCache.get(cacheKey);
    if (!force && cachedScan && Date.now() - cachedScan.at < 15_000) {
      return cachedScan.entries;
    }
    const files = [];
    const availableRoots = roots.filter((root) => {
      try {
        return fs.statSync(root).isDirectory();
      } catch {
        return false;
      }
    });
    for (const root of availableRoots) await walkJsonl(root, files);
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const entries = [];
    const seen = new Set();
    let catalogChanged = false;
    for (const file of files) {
      const transcriptPath = canonicalFilePath(file.path);
      const key = catalogKey(transcriptPath);
      if (!transcriptPath || !key || seen.has(key)) continue;
      seen.add(key);
      const existing = this.catalog.get(key);
      const unchanged =
        existing?.aiToolId === aiToolId &&
        existing?.sessionId &&
        existing?.cwd &&
        existing.mtimeMs === file.mtimeMs &&
        existing.size === file.size;
      const metadata = unchanged
        ? existing
        : await readMetadata({ ...file, path: transcriptPath }, aiToolId);
      const entry = {
        aiToolId,
        sessionId: metadata.sessionId,
        cwd: metadata.cwd,
        transcriptPath,
        path: transcriptPath,
        events: Number(metadata.events) || 0,
        size: file.size,
        mtimeMs: file.mtimeMs,
        lastSeenAt: Date.now(),
      };
      if (
        !existing ||
        existing.sessionId !== entry.sessionId ||
        existing.cwd !== entry.cwd ||
        existing.size !== entry.size ||
        existing.mtimeMs !== entry.mtimeMs ||
        existing.transcriptPath !== entry.transcriptPath
      ) {
        catalogChanged = true;
      }
      this.catalog.set(key, entry);
      this.metadataCache.set(transcriptPath, {
        mtimeMs: file.mtimeMs,
        size: file.size,
        value: entry,
      });
      entries.push(entry);
    }
    if (availableRoots.length > 0 && files.length < MAX_TRANSCRIPTS) {
      for (const [key, entry] of this.catalog) {
        if (
          entry.aiToolId === aiToolId &&
          availableRoots.some((root) => isInsideRoot(entry.transcriptPath, root)) &&
          !seen.has(key)
        ) {
          this.catalog.delete(key);
          this.metadataCache.delete(entry.transcriptPath);
          catalogChanged = true;
        }
      }
    }
    if (!this.catalogScannedTools.has(aiToolId)) {
      this.catalogScannedTools.add(aiToolId);
      catalogChanged = true;
    }
    if (catalogChanged) await this.persistCatalog();
    this.scanCache.set(cacheKey, { at: Date.now(), entries });
    return entries;
  }

  async refreshCatalog(aiToolId = null) {
    const tools = aiToolId ? [aiToolId] : ["codex", "claude"];
    for (const tool of tools) {
      if (STORAGE_TOOLS.has(tool)) await this.scan(tool, true);
    }
    return {
      path: this.catalogPath,
      updatedAt: this.catalogUpdatedAt,
      files: this.catalog.size,
    };
  }

  async resolve({
    aiToolId,
    folder,
    preferredSessionId,
    agentId = null,
    allowFolderFallback = true,
    transcriptRoot = null,
  }) {
    const tool = String(aiToolId || "").toLowerCase();
    if (tool !== "codex" && tool !== "claude") return null;
    const preferred = String(preferredSessionId || "").trim();
    const candidateNote = agentId ? this.notes.get(agentId) : null;
    const note = !transcriptRoot || (candidateNote?.transcriptPath && isInsideRoot(candidateNote.transcriptPath, transcriptRoot)) ? candidateNote : null;
    const notedSessionId =
      note?.sessionId && (!note.cwd || sameFolder(note.cwd, folder))
        ? String(note.sessionId).trim()
        : null;
    if (
      preferred &&
      notedSessionId &&
      notedSessionId.toLowerCase() === preferred.toLowerCase()
    ) {
      return notedSessionId;
    }
    // The per-agent hook index is the only unambiguous recovery source when
    // localStorage lost its lastSessionId and several agents share one folder.
    if (!preferred && notedSessionId) {
      return notedSessionId;
    }
    if (!preferred && !allowFolderFallback) return null;
    const entries = (await this.scan(tool)).filter((entry) => !transcriptRoot || isInsideRoot(entry.transcriptPath, transcriptRoot));
    if (preferred) {
      const exact = entries.find(
        (entry) =>
          entry.sessionId?.toLowerCase() === preferred.toLowerCase() &&
          (!entry.cwd || !folder || sameFolder(entry.cwd, folder))
      );
      if (exact) return exact.sessionId;
    }
    if (notedSessionId) return notedSessionId;
    if (!allowFolderFallback) return null;
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

  /**
   * Return storage for explicit current sessions or every catalogued session
   * belonging to one project folder.
   * Codex happens to shard transcripts by date, but that directory layout is
   * an implementation detail: ownership is established from JSONL cwd +
   * sessionId metadata. Claude subagent JSONLs share their parent session id
   * and are therefore folded into the same row and byte total.
   */
  async storageForSessions({
    folder,
    sessions,
    includeAllProjectSessions = false,
    force = false,
  }) {
    const requested = new Map();
    for (const candidate of Array.isArray(sessions) ? sessions : []) {
      const aiToolId = String(candidate?.aiToolId || "").toLowerCase();
      const sessionId = String(candidate?.sessionId || "").trim().toLowerCase();
      if (!STORAGE_TOOLS.has(aiToolId) || !sessionId) continue;
      if (!requested.has(aiToolId)) requested.set(aiToolId, new Set());
      requested.get(aiToolId).add(sessionId);
    }

    if (includeAllProjectSessions) {
      for (const tool of STORAGE_TOOLS) {
        if (!this.catalogScannedTools.has(tool)) await this.scan(tool, true);
      }
    }

    for (const [aiToolId, sessionIds] of requested) {
      const catalogSessionIds = new Set(
        [...this.catalog.values()]
          .filter(
            (entry) =>
              entry.aiToolId === aiToolId &&
              entry.sessionId &&
              sameFolder(entry.cwd, folder)
          )
          .map((entry) => entry.sessionId.toLowerCase())
      );
      if (force || [...sessionIds].some((sessionId) => !catalogSessionIds.has(sessionId))) {
        await this.scan(aiToolId, true);
      }
    }

    const grouped = new Map();
    let catalogChanged = false;
    const tools = includeAllProjectSessions
      ? ["codex", "claude"]
      : [...requested.keys()];
    for (const aiToolId of tools) {
      const sessionIds = requested.get(aiToolId) ?? new Set();
      const entries = [...this.catalog.values()].filter(
        (entry) => entry.aiToolId === aiToolId
      );
      for (const entry of entries) {
        const sessionId = String(entry.sessionId || "").trim();
        const normalizedSessionId = sessionId.toLowerCase();
        if (
          !sessionId ||
          (!includeAllProjectSessions && !sessionIds.has(normalizedSessionId)) ||
          !sameFolder(entry.cwd, folder)
        ) {
          continue;
        }
        let stat;
        try {
          stat = await fsPromises.stat(entry.transcriptPath);
        } catch {
          const key = catalogKey(entry.transcriptPath);
          if (key) this.catalog.delete(key);
          this.metadataCache.delete(entry.transcriptPath);
          catalogChanged = true;
          continue;
        }
        if (entry.size !== stat.size || entry.mtimeMs !== stat.mtimeMs) {
          entry.size = stat.size;
          entry.mtimeMs = stat.mtimeMs;
          entry.lastSeenAt = Date.now();
          catalogChanged = true;
        }
        const key = `${aiToolId}:${normalizedSessionId}`;
        let group = grouped.get(key);
        if (!group) {
          group = {
            aiToolId,
            sessionId,
            bytes: 0,
            fileCount: 0,
            updatedAt: 0,
            primaryPath: null,
            paths: [],
          };
          grouped.set(key, group);
        }
        group.bytes += Number(entry.size) || 0;
        group.fileCount += 1;
        group.updatedAt = Math.max(group.updatedAt, Number(entry.mtimeMs) || 0);
        group.paths.push(entry.transcriptPath);
      }
    }

    if (catalogChanged) await this.persistCatalog();

    const results = [...grouped.values()];
    for (const result of results) {
      result.paths.sort((left, right) => {
        const leftParts = String(left).split(/[\\/]/).length;
        const rightParts = String(right).split(/[\\/]/).length;
        return leftParts - rightParts || String(left).localeCompare(String(right));
      });
      result.primaryPath = result.paths[0] ?? null;
    }
    results.sort((left, right) => right.updatedAt - left.updatedAt);
    return results;
  }

  agentIdsForSession({ folder, sessionId }) {
    const normalizedSessionId = String(sessionId || "").trim().toLowerCase();
    if (!normalizedSessionId) return [];
    const ids = [];
    for (const [agentId, note] of this.notes) {
      if (
        String(note?.sessionId || "").trim().toLowerCase() === normalizedSessionId &&
        (!note?.cwd || sameFolder(note.cwd, folder))
      ) {
        ids.push(agentId);
      }
    }
    return ids;
  }

  async forgetSession({ folder, aiToolId = null, sessionId, transcriptPaths = [] }) {
    const normalizedSessionId = String(sessionId || "").trim().toLowerCase();
    let notesChanged = false;
    let catalogChanged = false;
    for (const [agentId, note] of this.notes) {
      if (
        String(note?.sessionId || "").trim().toLowerCase() === normalizedSessionId &&
        (!note?.cwd || sameFolder(note.cwd, folder))
      ) {
        this.notes.delete(agentId);
        notesChanged = true;
      }
    }
    for (const transcriptPath of transcriptPaths) {
      this.metadataCache.delete(transcriptPath);
      const key = catalogKey(transcriptPath);
      if (key && this.catalog.delete(key)) catalogChanged = true;
    }
    for (const [key, entry] of this.catalog) {
      if (
        (!aiToolId || entry.aiToolId === aiToolId) &&
        String(entry.sessionId || "").toLowerCase() === normalizedSessionId &&
        sameFolder(entry.cwd, folder)
      ) {
        this.catalog.delete(key);
        this.metadataCache.delete(entry.transcriptPath);
        catalogChanged = true;
      }
    }
    this.scanCache.clear();
    if (notesChanged) await this.persistNotes();
    if (catalogChanged) await this.persistCatalog();
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
