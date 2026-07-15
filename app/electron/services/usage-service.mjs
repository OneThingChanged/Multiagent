import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

function sameFolder(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => String(value).replace(/[\\/]+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

export class UsageService {
  constructor(databasePath, sessionService) {
    this.databasePath = databasePath;
    this.sessionService = sessionService;
    this.catalog = { projects: [], agents: [] };
    this.database = null;
  }

  db() {
    if (this.database) return this.database;
    this.database = new DatabaseSync(this.databasePath);
    this.database.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT NOT NULL UNIQUE,
        ts INTEGER NOT NULL, project_id TEXT, project_name TEXT, agent_id TEXT,
        agent_name TEXT, session_id TEXT, tool TEXT NOT NULL, model TEXT, cwd TEXT,
        source_path TEXT, source_offset INTEGER, input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0, cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0, reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0, raw_kind TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage_sources (
        source_path TEXT PRIMARY KEY, tool TEXT NOT NULL, session_id TEXT,
        last_offset INTEGER NOT NULL DEFAULT 0, last_size INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON usage_events(ts);
      CREATE INDEX IF NOT EXISTS idx_usage_events_agent_ts ON usage_events(agent_id, ts);
    `);
    return this.database;
  }

  syncCatalog(projects, agents) {
    this.catalog = {
      projects: Array.isArray(projects) ? projects : [],
      agents: Array.isArray(agents) ? agents : [],
    };
  }

  ownerFor(entry, tool) {
    const agents = this.catalog.agents.filter((agent) => agent.aiToolId === tool);
    const agent = agents.find((candidate) =>
      candidate.lastSessionId && candidate.lastSessionId === entry.sessionId
    ) ?? agents.find((candidate) => sameFolder(candidate.folder, entry.cwd));
    const project = agent
      ? this.catalog.projects.find((candidate) => candidate.id === agent.projectId)
      : null;
    return {
      agent: agent ?? {
        id: `${tool}:${entry.sessionId || entry.path}`,
        name: entry.sessionId || "Unknown session",
        folder: entry.cwd || "",
        aiToolId: tool,
      },
      project,
    };
  }

  eventFromItem(item, context, sourceOffset) {
    if (context.tool === "claude") {
      const usage = item?.message?.usage;
      if (!usage) return null;
      const input = number(usage.input_tokens);
      const output = number(usage.output_tokens);
      const cacheWrite = number(usage.cache_creation_input_tokens);
      const cacheRead = number(usage.cache_read_input_tokens);
      const total = input + output + cacheWrite + cacheRead;
      if (total <= 0) return null;
      const sessionId = item.sessionId || context.sessionId;
      const requestKey = item.requestId || item.message?.id || item.uuid || sourceOffset;
      return {
        sourceKey: `claude:${sessionId || "unknown"}:${requestKey}`,
        ts: timestamp(item.timestamp), sessionId, model: item.message?.model || null,
        cwd: item.cwd || context.cwd, input, output, cacheRead, cacheWrite,
        reasoning: 0, total, rawKind: "claude_message_usage",
      };
    }
    const payload = item?.payload;
    if (item?.type !== "event_msg" || payload?.type !== "token_count") return null;
    const usage = payload.info?.last_token_usage;
    if (!usage) return null;
    const input = number(usage.input_tokens);
    const output = number(usage.output_tokens);
    const cacheRead = number(usage.cached_input_tokens);
    const reasoning = number(usage.reasoning_output_tokens);
    const reported = number(usage.total_tokens);
    const total = reported > 0 ? reported + cacheRead + reasoning : input + output + cacheRead + reasoning;
    if (total <= 0) return null;
    const ts = timestamp(item.timestamp);
    const cumulative = number(payload.info?.total_token_usage?.total_tokens) || sourceOffset;
    return {
      sourceKey: `codex:${context.sessionId || "unknown"}:${ts}:${cumulative}`,
      ts, sessionId: context.sessionId, model: context.model, cwd: context.cwd,
      input, output, cacheRead, cacheWrite: 0, reasoning, total,
      rawKind: "codex_token_count",
    };
  }

  updateContext(item, context) {
    if (context.tool !== "codex") return;
    if (item?.type === "session_meta") {
      context.sessionId = item.payload?.id || context.sessionId;
      context.cwd = item.payload?.cwd || context.cwd;
      context.model = item.payload?.model || context.model;
    } else if (item?.type === "turn_context") {
      context.model = item.payload?.model || context.model;
      context.cwd = item.payload?.cwd || context.cwd;
    }
  }

  ingestFile(entry, tool) {
    const db = this.db();
    const stat = fs.statSync(entry.path);
    const source = db.prepare("SELECT last_offset FROM usage_sources WHERE source_path=?").get(entry.path);
    let start = Number(source?.last_offset) || 0;
    if (start > stat.size) start = 0;
    if (start === stat.size) return 0;
    const fd = fs.openSync(entry.path, "r");
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    const lastNewline = buffer.lastIndexOf(0x0a);
    if (lastNewline < 0) return 0;
    const readable = buffer.subarray(0, lastNewline + 1);
    const context = { tool, sessionId: entry.sessionId, cwd: entry.cwd, model: null };
    const { agent, project } = this.ownerFor(entry, tool);
    const insert = db.prepare(`INSERT OR IGNORE INTO usage_events (
      source_key,ts,project_id,project_name,agent_id,agent_name,session_id,tool,model,cwd,
      source_path,source_offset,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,
      reasoning_output_tokens,total_tokens,raw_kind
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let cursor = 0;
    let inserted = 0;
    while (cursor < readable.length) {
      const newline = readable.indexOf(0x0a, cursor);
      if (newline < 0) break;
      const offset = start + cursor;
      const line = readable.subarray(cursor, newline).toString("utf8").trim();
      cursor = newline + 1;
      if (!line) continue;
      let item;
      try { item = JSON.parse(line); } catch { continue; }
      this.updateContext(item, context);
      const event = this.eventFromItem(item, context, offset);
      if (!event) continue;
      const result = insert.run(
        event.sourceKey, event.ts, project?.id ?? null, project?.name ?? null,
        agent.id, agent.name, event.sessionId ?? null, tool, event.model ?? null,
        event.cwd ?? agent.folder ?? null, entry.path, offset, event.input, event.output,
        event.cacheRead, event.cacheWrite, event.reasoning, event.total, event.rawKind
      );
      inserted += Number(result.changes);
    }
    db.prepare(`INSERT INTO usage_sources(source_path,tool,session_id,last_offset,last_size,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(source_path) DO UPDATE SET tool=excluded.tool,
      session_id=excluded.session_id,last_offset=excluded.last_offset,last_size=excluded.last_size,
      updated_at=excluded.updated_at`).run(
        entry.path, tool, context.sessionId ?? null, start + readable.length, stat.size, Date.now()
      );
    return inserted;
  }

  async ingestAll() {
    const summary = { files: 0, events: 0, errors: [] };
    for (const tool of ["codex", "claude"]) {
      const entries = await this.sessionService.scan(tool, true);
      for (const entry of entries) {
        try {
          summary.events += this.ingestFile(entry, tool);
          summary.files += 1;
        } catch (error) {
          summary.errors.push(`${entry.path}: ${String(error)}`);
        }
      }
    }
    return summary;
  }

  ingestHook(agentId, transcriptPath, sessionId = null, cwd = null) {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return 0;
    const agent = this.catalog.agents.find((candidate) => candidate.id === agentId);
    const tool = agent?.aiToolId;
    if (tool !== "codex" && tool !== "claude") return 0;
    return this.ingestFile(
      { path: transcriptPath, sessionId: sessionId || agent.lastSessionId || null, cwd: cwd || agent.folder },
      tool
    );
  }

  dashboardSummary() {
    const db = this.db();
    const totals = db.prepare(`SELECT COUNT(*) events, COALESCE(SUM(input_tokens),0) inputTokens,
      COALESCE(SUM(output_tokens),0) outputTokens, COALESCE(SUM(cache_read_tokens),0) cacheReadTokens,
      COALESCE(SUM(cache_write_tokens),0) cacheWriteTokens,
      COALESCE(SUM(reasoning_output_tokens),0) reasoningOutputTokens,
      COALESCE(SUM(total_tokens),0) totalTokens FROM usage_events`).get();
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value)]));
  }

  close() {
    this.database?.close();
    this.database = null;
  }
}
