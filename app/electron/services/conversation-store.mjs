import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseChatTranscript } from "./chat-transcript.mjs";

const STORE_VERSION = 1;
const CONFIG_VERSION = 1;
const DATABASE_NAME = "multiagent-conversations.db";
const MARKER_NAME = ".multiagent-conversation-store.json";
const READ_CHUNK_BYTES = 1024 * 1024;
const MAX_BLOCKS_PER_PAGE = 1000;
const ARTIFACT_EXTENSIONS = new Set([
  ".md", ".markdown", ".html", ".htm", ".png", ".jpg", ".jpeg", ".gif",
  ".webp", ".bmp", ".svg", ".pdf", ".docx", ".xlsx", ".csv", ".json",
]);

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function normalizedRoot(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return path.resolve(value.trim()).replace(/[\\/]+$/, "");
}

function comparablePath(value) {
  const resolved = normalizedRoot(value);
  return process.platform === "win32" ? resolved?.toLowerCase() : resolved;
}

function samePath(left, right) {
  return Boolean(left && right && comparablePath(left) === comparablePath(right));
}

function containsPath(parent, child) {
  const root = comparablePath(parent);
  const candidate = comparablePath(child);
  if (!root || !candidate) return false;
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function isInsideGitWorkingTree(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporary, filePath);
}

function blockContentKey(block) {
  if (block?.kind !== "text") return null;
  const text = String(block.text || "").trim();
  if (!text) return null;
  return createHash("sha256").update(text).digest("hex");
}

function redactSecretText(value) {
  return String(value).replace(
    /((?:authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|client[_-]?secret|cookie)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
    "$1[REDACTED]",
  );
}

function sanitizeToolValue(value, key = "", depth = 0) {
  if (depth > 8) return "[TRUNCATED]";
  if (/token|password|secret|authorization|cookie|api.?key/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactSecretText(value).slice(0, 20_000);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeToolValue(item, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).slice(0, 200).map(([childKey, childValue]) => [
        childKey,
        sanitizeToolValue(childValue, childKey, depth + 1),
      ])
    );
  }
  return value;
}

function normalizeBlock(block) {
  if (!block || typeof block !== "object") return null;
  if (!new Set(["user", "assistant", "tool"]).has(block.role)) return null;
  if (!new Set(["text", "reasoning", "tool-call", "tool-result", "image"]).has(block.kind)) {
    return null;
  }
  const normalized = JSON.parse(JSON.stringify(block));
  if (normalized.input !== undefined) normalized.input = sanitizeToolValue(normalized.input);
  if (typeof normalized.output === "string") normalized.output = redactSecretText(normalized.output);
  return normalized;
}

function possibleArtifactPaths(block) {
  const values = [];
  for (const value of [block?.text, block?.output, block?.summary]) {
    if (typeof value === "string") values.push(value);
  }
  if (block?.input && typeof block.input === "object") {
    for (const key of ["file_path", "path", "output_path", "relativePath"]) {
      if (typeof block.input[key] === "string") values.push(block.input[key]);
    }
  }
  const candidates = new Set();
  const pattern = /(?:[A-Za-z]:[\\/][^\r\n"'<>|]+|(?:\.\.?[\\/])?[^\s"'<>|]+\.(?:md|markdown|html?|png|jpe?g|gif|webp|bmp|svg|pdf|docx|xlsx|csv|json))/gi;
  for (const value of values) {
    for (const match of value.matchAll(pattern)) {
      const candidate = String(match[0] || "").replace(/[),.;:]+$/, "").trim();
      if (candidate) candidates.add(candidate);
    }
  }
  return [...candidates];
}

async function directoryBytes(root) {
  let total = 0;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fsPromises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) {
        try { total += (await fsPromises.stat(absolute)).size; } catch {}
      }
    }
  }
  return total;
}

export class ConversationStore {
  constructor(rootPath) {
    this.rootPath = normalizedRoot(rootPath);
    if (!this.rootPath) throw new Error("대화 저장소 경로가 비어 있습니다.");
    this.databasePath = path.join(this.rootPath, DATABASE_NAME);
    this.database = null;
    this.ingestChains = new Map();
    fs.mkdirSync(this.rootPath, { recursive: true });
    this.writeMarker();
  }

  writeMarker() {
    const markerPath = path.join(this.rootPath, MARKER_NAME);
    if (!fs.existsSync(markerPath)) {
      atomicWriteJson(markerPath, { version: STORE_VERSION, type: "multiagent-conversation-store" });
    }
  }

  db() {
    if (this.database) return this.database;
    this.database = new DatabaseSync(this.databasePath);
    this.database.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_session_id TEXT NOT NULL,
        project_path TEXT,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        closed_at INTEGER,
        UNIQUE(agent_id, provider, provider_session_id)
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_agent_updated
        ON conversations(agent_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS conversation_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        source_key TEXT NOT NULL UNIQUE,
        source_path TEXT,
        source_generation INTEGER NOT NULL DEFAULT 0,
        source_offset INTEGER,
        source_block_index INTEGER,
        origin TEXT NOT NULL DEFAULT 'transcript',
        confirmed INTEGER NOT NULL DEFAULT 1,
        role TEXT NOT NULL,
        kind TEXT NOT NULL,
        content_key TEXT,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_blocks_page
        ON conversation_blocks(conversation_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_conversation_blocks_pending
        ON conversation_blocks(conversation_id, origin, confirmed, content_key, id);
      CREATE TABLE IF NOT EXISTS conversation_sources (
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        source_path TEXT NOT NULL,
        provider TEXT NOT NULL,
        generation INTEGER NOT NULL DEFAULT 0,
        last_offset INTEGER NOT NULL DEFAULT 0,
        last_size INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(conversation_id, source_path)
      );
      CREATE TABLE IF NOT EXISTS conversation_artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        block_id INTEGER REFERENCES conversation_blocks(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        modified_at INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE(conversation_id, path)
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_artifacts_conversation
        ON conversation_artifacts(conversation_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
      PRAGMA user_version=${STORE_VERSION};
    `);
    return this.database;
  }

  ensureConversation({ agentId, sessionId, provider, projectPath = null, title = null }) {
    const normalizedAgentId = String(agentId || "").trim();
    const normalizedSessionId = String(sessionId || "").trim();
    const normalizedProvider = String(provider || "").trim().toLowerCase();
    if (!normalizedAgentId || !normalizedSessionId || !normalizedProvider) return null;
    const database = this.db();
    const existing = database.prepare(`SELECT id FROM conversations
      WHERE agent_id=? AND provider=? AND provider_session_id=?`).get(
      normalizedAgentId,
      normalizedProvider,
      normalizedSessionId,
    );
    const timestamp = nowSeconds();
    if (existing?.id) {
      database.prepare(`UPDATE conversations SET
        project_path=COALESCE(?,project_path), title=COALESCE(?,title), updated_at=?
        WHERE id=?`).run(projectPath || null, title || null, timestamp, existing.id);
      return String(existing.id);
    }
    const id = randomUUID();
    database.prepare(`INSERT INTO conversations
      (id,agent_id,provider,provider_session_id,project_path,title,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      id,
      normalizedAgentId,
      normalizedProvider,
      normalizedSessionId,
      projectPath || null,
      title || null,
      timestamp,
      timestamp,
    );
    return id;
  }

  recordUserMessage({ agentId, sessionId, provider, projectPath = null, title = null, text }) {
    const content = String(text || "").trim();
    if (!content || content === "/clear") return null;
    const conversationId = this.ensureConversation({
      agentId, sessionId, provider, projectPath, title,
    });
    if (!conversationId) return null;
    const block = { role: "user", kind: "text", text: content };
    const result = this.db().prepare(`INSERT INTO conversation_blocks
      (conversation_id,source_key,origin,confirmed,role,kind,content_key,payload_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      conversationId,
      `composer:${conversationId}:${randomUUID()}`,
      "composer",
      0,
      block.role,
      block.kind,
      blockContentKey(block),
      JSON.stringify(block),
      nowSeconds(),
    );
    this.indexArtifacts({
      insertArtifact: this.db().prepare(`INSERT OR IGNORE INTO conversation_artifacts
        (conversation_id,block_id,kind,path,size,modified_at,created_at) VALUES (?,?,?,?,?,?,?)`),
      conversationId,
      blockId: Number(result.lastInsertRowid),
      block,
      projectPath,
    });
    this.db().prepare("UPDATE conversations SET updated_at=? WHERE id=?")
      .run(nowSeconds(), conversationId);
    return { conversationId, sequence: Number(result.lastInsertRowid), block };
  }

  async ingestTranscript(input) {
    const transcriptPath = normalizedRoot(input?.transcriptPath);
    if (!transcriptPath) return null;
    const key = `${input.agentId}:${input.provider}:${input.sessionId}:${comparablePath(transcriptPath)}`;
    const active = this.ingestChains.get(key);
    if (active) return active;
    const operation = this.ingestTranscriptNow({
      ...input,
      transcriptPath,
    });
    this.ingestChains.set(key, operation);
    operation.finally(() => {
      if (this.ingestChains.get(key) === operation) this.ingestChains.delete(key);
    }).catch(() => {});
    return operation;
  }

  sourceProgress({ agentId, sessionId, provider, transcriptPath, projectPath = null, title = null }) {
    const conversationId = this.ensureConversation({
      agentId, sessionId, provider, projectPath, title,
    });
    if (!conversationId) return { conversationId: null, lastOffset: 0, lastSize: 0 };
    const sourcePath = normalizedRoot(transcriptPath);
    if (!sourcePath) return { conversationId, lastOffset: 0, lastSize: 0 };
    const row = this.db().prepare(`SELECT last_offset lastOffset,last_size lastSize
      FROM conversation_sources WHERE conversation_id=? AND source_path=?`).get(
      conversationId,
      sourcePath,
    );
    return {
      conversationId,
      lastOffset: Math.max(0, Number(row?.lastOffset) || 0),
      lastSize: Math.max(0, Number(row?.lastSize) || 0),
    };
  }

  async ingestTranscriptNow({ agentId, sessionId, provider, transcriptPath, projectPath = null, title = null }) {
    const conversationId = this.ensureConversation({
      agentId, sessionId, provider, projectPath, title,
    });
    if (!conversationId) return null;
    let stat;
    try {
      stat = await fsPromises.stat(transcriptPath);
      if (!stat.isFile()) return { conversationId, inserted: 0 };
    } catch {
      return { conversationId, inserted: 0 };
    }
    const database = this.db();
    const source = database.prepare(`SELECT generation,last_offset lastOffset,last_size lastSize
      FROM conversation_sources WHERE conversation_id=? AND source_path=?`).get(
      conversationId,
      transcriptPath,
    );
    let generation = Number(source?.generation) || 0;
    let offset = Math.max(0, Number(source?.lastOffset) || 0);
    if (stat.size < offset) {
      generation += 1;
      offset = 0;
    }
    if (stat.size === offset) {
      database.prepare("UPDATE conversations SET updated_at=? WHERE id=?")
        .run(nowSeconds(), conversationId);
      return { conversationId, inserted: 0 };
    }

    const insertBlock = database.prepare(`INSERT OR IGNORE INTO conversation_blocks
      (conversation_id,source_key,source_path,source_generation,source_offset,source_block_index,
       origin,confirmed,role,kind,content_key,payload_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const findPending = database.prepare(`SELECT id FROM conversation_blocks
      WHERE conversation_id=? AND origin='composer' AND confirmed=0 AND content_key=?
      ORDER BY id LIMIT 1`);
    const confirmPending = database.prepare(`UPDATE conversation_blocks SET
      source_path=?,source_generation=?,source_offset=?,source_block_index=?,confirmed=1
      WHERE id=?`);
    const upsertSource = database.prepare(`INSERT INTO conversation_sources
      (conversation_id,source_path,provider,generation,last_offset,last_size,updated_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(conversation_id,source_path) DO UPDATE SET
        provider=excluded.provider,generation=excluded.generation,
        last_offset=excluded.last_offset,last_size=excluded.last_size,updated_at=excluded.updated_at`);
    const insertArtifact = database.prepare(`INSERT OR IGNORE INTO conversation_artifacts
      (conversation_id,block_id,kind,path,size,modified_at,created_at) VALUES (?,?,?,?,?,?,?)`);
    let inserted = 0;
    let processedOffset = offset;
    let pending = Buffer.alloc(0);
    let pendingStart = offset;
    const handle = await fsPromises.open(transcriptPath, "r");
    try {
      let position = offset;
      while (position < stat.size) {
        const length = Math.min(READ_CHUNK_BYTES, stat.size - position);
        const chunk = Buffer.alloc(length);
        const { bytesRead } = await handle.read(chunk, 0, length, position);
        if (!bytesRead) break;
        position += bytesRead;
        const combined = pending.length
          ? Buffer.concat([pending, chunk.subarray(0, bytesRead)])
          : chunk.subarray(0, bytesRead);
        const rows = [];
        let lineStart = 0;
        for (let index = 0; index < combined.length; index += 1) {
          if (combined[index] !== 0x0a) continue;
          let line = combined.subarray(lineStart, index);
          if (line.length && line[line.length - 1] === 0x0d) line = line.subarray(0, -1);
          rows.push({ text: line.toString("utf8"), offset: pendingStart + lineStart });
          lineStart = index + 1;
          processedOffset = pendingStart + lineStart;
        }
        pending = Buffer.from(combined.subarray(lineStart));
        pendingStart = processedOffset;

        database.exec("BEGIN IMMEDIATE");
        try {
          for (const row of rows) {
            const parsed = parseChatTranscript(row.text, provider);
            for (let blockIndex = 0; blockIndex < parsed.length; blockIndex += 1) {
              const block = normalizeBlock(parsed[blockIndex]);
              if (!block) continue;
              const contentKey = blockContentKey(block);
              if (block.role === "user" && block.kind === "text" && contentKey) {
                const pendingRow = findPending.get(conversationId, contentKey);
                if (pendingRow?.id) {
                  confirmPending.run(transcriptPath, generation, row.offset, blockIndex, pendingRow.id);
                  continue;
                }
              }
              const result = insertBlock.run(
                conversationId,
                `transcript:${conversationId}:${transcriptPath}:${generation}:${row.offset}:${blockIndex}`,
                transcriptPath,
                generation,
                row.offset,
                blockIndex,
                "transcript",
                1,
                block.role,
                block.kind,
                contentKey,
                JSON.stringify(block),
                nowSeconds(),
              );
              if (Number(result.changes) > 0) {
                inserted += 1;
                this.indexArtifacts({
                  insertArtifact,
                  conversationId,
                  blockId: Number(result.lastInsertRowid),
                  block,
                  projectPath,
                });
              }
            }
          }
          upsertSource.run(
            conversationId,
            transcriptPath,
            provider,
            generation,
            processedOffset,
            stat.size,
            nowSeconds(),
          );
          database.prepare("UPDATE conversations SET updated_at=? WHERE id=?")
            .run(nowSeconds(), conversationId);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await handle.close().catch(() => {});
    }
    return { conversationId, inserted };
  }

  indexArtifacts({ insertArtifact, conversationId, blockId, block, projectPath }) {
    for (const candidate of possibleArtifactPaths(block)) {
      const resolved = path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : projectPath
          ? path.resolve(projectPath, candidate.replace(/^\.[\\/]/, ""))
          : null;
      if (!resolved || !ARTIFACT_EXTENSIONS.has(path.extname(resolved).toLowerCase())) continue;
      let stat;
      try {
        stat = fs.statSync(resolved);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }
      insertArtifact.run(
        conversationId,
        blockId,
        path.extname(resolved).slice(1).toLowerCase() || "file",
        resolved,
        stat.size,
        Math.floor(stat.mtimeMs / 1000),
        nowSeconds(),
      );
    }
  }

  listBlocks({ agentId, sessionId, provider, beforeSequence = null, limit = 400 }) {
    const conversation = this.db().prepare(`SELECT id FROM conversations
      WHERE agent_id=? AND provider=? AND provider_session_id=?`).get(
      String(agentId || "").trim(),
      String(provider || "").trim().toLowerCase(),
      String(sessionId || "").trim(),
    );
    if (!conversation?.id) {
      return { conversationId: null, blocks: [], artifacts: [], hasOlder: false, firstSequence: null, total: 0 };
    }
    const safeLimit = Math.min(MAX_BLOCKS_PER_PAGE, Math.max(1, Number(limit) || 400));
    const before = Number(beforeSequence);
    const rows = Number.isSafeInteger(before) && before > 0
      ? this.db().prepare(`SELECT id,payload_json payload FROM conversation_blocks
          WHERE conversation_id=? AND id<? ORDER BY id DESC LIMIT ?`).all(
          conversation.id, before, safeLimit,
        )
      : this.db().prepare(`SELECT id,payload_json payload FROM conversation_blocks
          WHERE conversation_id=? ORDER BY id DESC LIMIT ?`).all(
          conversation.id, safeLimit,
        );
    rows.reverse();
    const blocks = rows.map((row) => ({ ...JSON.parse(row.payload), sequence: Number(row.id) }));
    const firstSequence = blocks[0]?.sequence ?? null;
    const hasOlder = firstSequence != null && Boolean(this.db().prepare(`SELECT 1 found
      FROM conversation_blocks WHERE conversation_id=? AND id<? LIMIT 1`).get(
      conversation.id, firstSequence,
    ));
    const total = Number(this.db().prepare(`SELECT COUNT(*) count FROM conversation_blocks
      WHERE conversation_id=?`).get(conversation.id)?.count) || 0;
    const artifacts = this.db().prepare(`SELECT kind,path,size,modified_at modifiedAt
      FROM conversation_artifacts WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 100`)
      .all(conversation.id)
      .map((row) => ({
        kind: String(row.kind),
        path: String(row.path),
        size: Math.max(0, Number(row.size) || 0),
        modifiedAt: row.modifiedAt == null ? null : Number(row.modifiedAt),
      }));
    return {
      conversationId: String(conversation.id),
      blocks,
      artifacts,
      hasOlder,
      firstSequence,
      total,
    };
  }

  summary() {
    const database = this.db();
    const conversations = Number(database.prepare("SELECT COUNT(*) count FROM conversations").get()?.count) || 0;
    const blocks = Number(database.prepare("SELECT COUNT(*) count FROM conversation_blocks").get()?.count) || 0;
    const artifacts = Number(database.prepare("SELECT COUNT(*) count FROM conversation_artifacts").get()?.count) || 0;
    return { conversations, blocks, artifacts };
  }

  checkpoint() {
    if (!this.database) return;
    this.database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  async settle() {
    await Promise.allSettled([...this.ingestChains.values()]);
  }

  close() {
    if (!this.database) return;
    this.checkpoint();
    this.database.close();
    this.database = null;
  }
}

export class ConversationStoreManager {
  constructor({ configDir, defaultRoot }) {
    this.configDir = normalizedRoot(configDir);
    this.defaultRoot = normalizedRoot(defaultRoot);
    if (!this.configDir || !this.defaultRoot) throw new Error("대화 저장소 기본 경로가 잘못되었습니다.");
    this.configPath = path.join(this.configDir, "conversation-store-config.json");
    this.rootPath = this.loadConfiguredRoot();
    this.store = null;
    this.unavailableError = null;
    try {
      if (!samePath(this.rootPath, this.defaultRoot) && !fs.existsSync(this.rootPath)) {
        throw new Error("사용자 지정 대화 저장 폴더를 찾을 수 없습니다.");
      }
      this.store = new ConversationStore(this.rootPath);
    } catch (error) {
      // Never switch to a new empty archive silently: the provider JSONL remains
      // the temporary read fallback until the configured drive returns or the
      // user selects another root in Settings.
      this.unavailableError = error instanceof Error ? error.message : String(error);
    }
    this.migration = Promise.resolve();
  }

  loadConfiguredRoot() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      const customRoot = normalizedRoot(parsed?.customRoot);
      if (parsed?.version === CONFIG_VERSION && customRoot) return customRoot;
    } catch {}
    return this.defaultRoot;
  }

  saveConfiguredRoot(rootPath) {
    atomicWriteJson(this.configPath, {
      version: CONFIG_VERSION,
      customRoot: samePath(rootPath, this.defaultRoot) ? null : rootPath,
    });
  }

  async status() {
    if (!this.store) {
      return {
        path: this.rootPath,
        defaultPath: this.defaultRoot,
        custom: !samePath(this.rootPath, this.defaultRoot),
        databasePath: path.join(this.rootPath, DATABASE_NAME),
        available: false,
        error: this.unavailableError || "대화 저장소를 열 수 없습니다.",
        bytes: 0,
        conversations: 0,
        blocks: 0,
        artifacts: 0,
      };
    }
    const summary = this.store.summary();
    return {
      path: this.rootPath,
      defaultPath: this.defaultRoot,
      custom: !samePath(this.rootPath, this.defaultRoot),
      databasePath: this.store.databasePath,
      available: true,
      error: null,
      bytes: await directoryBytes(this.rootPath),
      ...summary,
    };
  }

  async ingestTranscript(input) {
    await this.migration.catch(() => {});
    return this.store?.ingestTranscript(input) ?? null;
  }

  async sourceProgress(input) {
    await this.migration.catch(() => {});
    return this.store?.sourceProgress(input) ?? {
      conversationId: null,
      lastOffset: 0,
      lastSize: 0,
    };
  }

  async recordUserMessage(input) {
    await this.migration.catch(() => {});
    return this.store?.recordUserMessage(input) ?? null;
  }

  async listBlocks(input) {
    await this.migration.catch(() => {});
    return this.store?.listBlocks(input) ?? {
      conversationId: null,
      blocks: [],
      artifacts: [],
      hasOlder: false,
      firstSequence: null,
      total: 0,
    };
  }

  async setRoot(requestedPath) {
    const target = requestedPath == null || String(requestedPath).trim() === ""
      ? this.defaultRoot
      : normalizedRoot(requestedPath);
    if (!target) throw new Error("선택한 저장 경로가 올바르지 않습니다.");
    const operation = this.migration.catch(() => {}).then(() => this.setRootNow(target));
    this.migration = operation;
    return operation;
  }

  async setRootNow(target) {
    if (samePath(target, this.rootPath) && this.store) return this.status();
    if (
      !samePath(target, this.rootPath) &&
      (containsPath(this.rootPath, target) || containsPath(target, this.rootPath))
    ) {
      throw new Error("현재 저장소의 상위·하위 폴더는 새 저장 위치로 사용할 수 없습니다.");
    }
    if (isInsideGitWorkingTree(target)) {
      throw new Error("Git 작업 폴더 내부는 대화 저장 위치로 사용할 수 없습니다.");
    }
    const targetParent = path.dirname(target);
    await fsPromises.mkdir(targetParent, { recursive: true });
    const probe = path.join(targetParent, `.multiagent-write-test-${randomUUID()}`);
    await fsPromises.writeFile(probe, "ok", "utf8");
    await fsPromises.unlink(probe);
    if (!this.store) {
      if (fs.existsSync(target)) {
        const entries = await fsPromises.readdir(target);
        const managed = entries.includes(MARKER_NAME) || entries.includes(DATABASE_NAME);
        if (entries.length > 0 && !managed) {
          throw new Error("비어 있지 않은 일반 폴더입니다. 전용 빈 폴더를 선택해 주세요.");
        }
      }
      const nextStore = new ConversationStore(target);
      // Opening the DB here proves the selected archive is readable before the
      // fixed config pointer is updated.
      nextStore.summary();
      this.rootPath = target;
      this.store = nextStore;
      this.unavailableError = null;
      this.saveConfiguredRoot(target);
      return this.status();
    }
    if (fs.existsSync(target)) {
      const entries = await fsPromises.readdir(target);
      const managed = entries.includes(MARKER_NAME) || entries.includes(DATABASE_NAME);
      if (entries.length > 0 && !managed) {
        throw new Error("비어 있지 않은 일반 폴더입니다. 전용 빈 폴더를 선택해 주세요.");
      }
    }

    const source = this.rootPath;
    const staging = path.join(targetParent, `.${path.basename(target)}.migrating-${randomUUID()}`);
    const previousTarget = fs.existsSync(target)
      ? path.join(targetParent, `${path.basename(target)}.backup-${Date.now()}`)
      : null;
    await this.store.settle();
    this.store.close();
    try {
      await fsPromises.cp(source, staging, { recursive: true, force: false, errorOnExist: false });
      const stagedDatabase = path.join(staging, DATABASE_NAME);
      if (fs.existsSync(stagedDatabase)) {
        const verify = new DatabaseSync(stagedDatabase, { readOnly: true });
        try {
          const result = verify.prepare("PRAGMA quick_check").get();
          if (String(result?.quick_check || "").toLowerCase() !== "ok") {
            throw new Error("복사된 대화 DB 무결성 검사에 실패했습니다.");
          }
        } finally {
          verify.close();
        }
      }
      if (previousTarget) await fsPromises.rename(target, previousTarget);
      await fsPromises.rename(staging, target);
      this.rootPath = target;
      this.saveConfiguredRoot(target);
      this.store = new ConversationStore(target);
      this.unavailableError = null;
      return this.status();
    } catch (error) {
      await fsPromises.rm(staging, { recursive: true, force: true }).catch(() => {});
      if (previousTarget && fs.existsSync(previousTarget) && !fs.existsSync(target)) {
        await fsPromises.rename(previousTarget, target).catch(() => {});
      }
      this.rootPath = source;
      this.store = new ConversationStore(source);
      throw error;
    }
  }

  close() {
    this.store?.close();
  }
}

export const conversationStoreConstants = {
  DATABASE_NAME,
  MARKER_NAME,
};
