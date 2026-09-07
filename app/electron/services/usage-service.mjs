import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const RATE_LIMIT_TAIL_BYTES = 1024 * 1024;
const RATE_LIMIT_TRANSCRIPT_LIMIT = 32;
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_USAGE_MIN_INTERVAL_MS = 60_000;
const CLAUDE_USAGE_TIMEOUT_MS = 10_000;
const FIVE_HOUR_MINUTES = 300;
const SEVEN_DAY_MINUTES = 10_080;
const USAGE_EVENT_PARSER_VERSION = 2;
const USAGE_EVENT_PARSER_VERSION_KEY = "usage_event_parser_version";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function optionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

function codexCumulativeFromSourceKey(sourceKey) {
  const value = String(sourceKey || "").split(":").at(-1);
  const cumulative = Number(value);
  return Number.isSafeInteger(cumulative) && cumulative > 0 ? cumulative : null;
}

function sameFolder(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => String(value).replace(/[\\/]+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizedTokenTotals(row = {}) {
  return {
    events: number(row.events),
    inputTokens: number(row.inputTokens),
    outputTokens: number(row.outputTokens),
    cacheReadTokens: number(row.cacheReadTokens),
    cacheWriteTokens: number(row.cacheWriteTokens),
    reasoningOutputTokens: number(row.reasoningOutputTokens),
    totalTokens: number(row.totalTokens),
  };
}

const TOKEN_TOTAL_FIELDS = [
  "events",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningOutputTokens",
  "totalTokens",
];

function sumTokenTotals(rows = []) {
  const total = normalizedTokenTotals();
  for (const row of rows) {
    const normalized = normalizedTokenTotals(row);
    for (const field of TOKEN_TOTAL_FIELDS) total[field] += normalized[field];
  }
  return total;
}

function isoWeekStart(year, week) {
  const januaryFourth = new Date(year, 0, 4);
  januaryFourth.setHours(0, 0, 0, 0);
  const weekday = januaryFourth.getDay() || 7;
  const start = new Date(januaryFourth);
  start.setDate(start.getDate() - weekday + 1 + (week - 1) * 7);
  return start;
}

function isoWeekParts(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return {
    year: date.getFullYear(),
    week: Math.ceil((((date - yearStart) / 86_400_000) + 1) / 7),
  };
}

function isoWeekNumber(value) {
  return isoWeekParts(value).week;
}

function isoWeeksInYear(year) {
  return isoWeekNumber(new Date(year, 11, 28));
}

function usageHistorySelection(selection, now) {
  const current = new Date(now);
  if (!Number.isFinite(current.getTime())) throw new TypeError("usage history requires a valid date");
  const mode = ["week", "month", "year"].includes(selection?.mode)
    ? selection.mode
    : "month";
  const currentIsoWeek = isoWeekParts(current);
  const latestYear = mode === "week" ? currentIsoWeek.year : current.getFullYear();
  const year = Number.isInteger(Number(selection?.year))
    ? Number(selection.year)
    : latestYear;
  if (year < 2000 || year > latestYear) throw new RangeError("usage history year is out of range");
  const currentWeek = currentIsoWeek.week;
  const month = Number.isInteger(Number(selection?.month))
    ? Number(selection.month)
    : current.getMonth() + 1;
  const week = Number.isInteger(Number(selection?.week))
    ? Number(selection.week)
    : currentWeek;
  if (month < 1 || month > 12) throw new RangeError("usage history month is out of range");
  if (week < 1 || week > isoWeeksInYear(year)) throw new RangeError("usage history week is out of range");
  if (year === current.getFullYear() && mode === "month" && month > current.getMonth() + 1) {
    throw new RangeError("usage history month is in the future");
  }
  if (year === currentIsoWeek.year && mode === "week" && week > currentWeek) {
    throw new RangeError("usage history week is in the future");
  }
  return { mode, year, month, week };
}

export class UsageService {
  constructor(databasePath, sessionService, options = {}) {
    this.databasePath = databasePath;
    this.sessionService = sessionService;
    this.catalog = { projects: [], agents: [] };
    this.database = null;
    this.rateLimitRefresh = null;
    this.dailyRollupSync = false;
    // Claude has no rate-limit snapshot inside its transcript (unlike Codex's
    // token_count.rate_limits), so account limits are read live from the OAuth
    // usage endpoint using the local Claude Code credentials.
    this.claudeCredentialsPath = options.claudeCredentialsPath
      ?? path.join(os.homedir(), ".claude", ".credentials.json");
    // Injectable for tests: () => Promise<{ usage, subscriptionType } | null>.
    this.claudeUsageFetcher = options.claudeUsageFetcher ?? null;
    this.claudeRateLimitRefresh = null;
    this.claudeRateLimitFetchedAt = 0;
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
      CREATE TABLE IF NOT EXISTS usage_rate_limits (
        limit_id TEXT PRIMARY KEY, limit_name TEXT, plan_type TEXT,
        primary_used_percent REAL, primary_window_minutes INTEGER, primary_resets_at INTEGER,
        secondary_used_percent REAL, secondary_window_minutes INTEGER, secondary_resets_at INTEGER,
        has_credits INTEGER NOT NULL DEFAULT 0, unlimited INTEGER NOT NULL DEFAULT 0,
        credit_balance TEXT, source_path TEXT, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_rate_limits_updated_at
        ON usage_rate_limits(updated_at);
      CREATE TABLE IF NOT EXISTS usage_daily (
        day TEXT PRIMARY KEY,
        events INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS usage_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.ensureUsageSourceStateColumns(this.database);
    this.migrateUsageEventParser(this.database);
    return this.database;
  }

  ensureUsageSourceStateColumns(database) {
    const columns = new Set(database.prepare("PRAGMA table_info(usage_sources)").all()
      .map((column) => String(column.name)));
    if (!columns.has("last_cumulative")) {
      database.exec("ALTER TABLE usage_sources ADD COLUMN last_cumulative INTEGER");
    }
    if (!columns.has("cumulative_segment")) {
      database.exec("ALTER TABLE usage_sources ADD COLUMN cumulative_segment INTEGER NOT NULL DEFAULT 0");
    }
  }

  migrateUsageEventParser(database) {
    const versionRow = database.prepare("SELECT value FROM usage_meta WHERE key=?")
      .get(USAGE_EVENT_PARSER_VERSION_KEY);
    const currentVersion = number(versionRow?.value);
    if (currentVersion >= USAGE_EVENT_PARSER_VERSION) return;

    const rows = database.prepare(`SELECT id,source_path sourcePath,source_key sourceKey,source_offset sourceOffset
      FROM usage_events WHERE tool='codex' ORDER BY source_path,source_offset,id`).all();
    const remove = database.prepare("DELETE FROM usage_events WHERE id=?");
    const updateSource = database.prepare(`UPDATE usage_sources
      SET last_cumulative=?, cumulative_segment=? WHERE source_path=?`);
    const sourceStates = new Map();
    let sourcePath = null;
    let previousCumulative = null;
    let cumulativeSegment = 0;
    let removed = 0;

    database.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        const nextSourcePath = typeof row.sourcePath === "string" ? row.sourcePath : null;
        if (nextSourcePath !== sourcePath) {
          if (sourcePath) {
            sourceStates.set(sourcePath, {
              lastCumulative: previousCumulative,
              cumulativeSegment,
            });
          }
          sourcePath = nextSourcePath;
          previousCumulative = null;
          cumulativeSegment = 0;
        }
        const cumulative = codexCumulativeFromSourceKey(row.sourceKey);
        if (cumulative == null) continue;
        if (sourcePath && previousCumulative === cumulative) {
          remove.run(row.id);
          removed += 1;
          continue;
        }
        if (previousCumulative != null && cumulative < previousCumulative) {
          cumulativeSegment += 1;
        }
        previousCumulative = cumulative;
      }
      if (sourcePath) {
        sourceStates.set(sourcePath, {
          lastCumulative: previousCumulative,
          cumulativeSegment,
        });
      }

      // Codex reports cached_input_tokens as a subset of input_tokens and
      // reasoning_output_tokens as a subset of output_tokens. Older versions
      // added both subsets to total_tokens a second time. Convert the stored
      // columns to mutually exclusive categories while preserving the
      // provider-reported input + output total.
      database.exec(`UPDATE usage_events SET
        total_tokens=MAX(input_tokens,0)+MAX(output_tokens,0),
        input_tokens=MAX(input_tokens-MIN(MAX(cache_read_tokens,0),MAX(input_tokens,0)),0),
        output_tokens=MAX(output_tokens-MIN(MAX(reasoning_output_tokens,0),MAX(output_tokens,0)),0),
        cache_read_tokens=MIN(MAX(cache_read_tokens,0),MAX(input_tokens,0)),
        reasoning_output_tokens=MIN(MAX(reasoning_output_tokens,0),MAX(output_tokens,0)),
        raw_kind='codex_token_count_v2'
        WHERE tool='codex' AND raw_kind!='codex_token_count_v2'`);
      for (const [pathKey, state] of sourceStates) {
        updateSource.run(state.lastCumulative, state.cumulativeSegment, pathKey);
      }
      database.exec("DELETE FROM usage_daily");
      database.prepare("DELETE FROM usage_meta WHERE key=?").run("daily_rollup_event_id");
      database.prepare(`INSERT INTO usage_meta(key,value) VALUES(?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
        .run(USAGE_EVENT_PARSER_VERSION_KEY, String(USAGE_EVENT_PARSER_VERSION));
      database.exec("COMMIT");
      if (rows.length > 0) {
        console.info(`[electron] corrected ${rows.length - removed} Codex usage events; removed ${removed} repeats`);
      }
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  ensureDailyRollup() {
    if (this.dailyRollupSync) return;
    this.dailyRollupSync = true;
    const db = this.db();
    try {
      const marker = db.prepare("SELECT value FROM usage_meta WHERE key='daily_rollup_event_id'").get();
      const maximum = Number(db.prepare("SELECT COALESCE(MAX(id),0) id FROM usage_events").get()?.id) || 0;
      let previous = Number(marker?.value);
      if (!Number.isFinite(previous) || previous < 0 || previous > maximum) {
        previous = 0;
        db.exec("DELETE FROM usage_daily");
      }
      if (previous < maximum) {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(`INSERT INTO usage_daily (
            day,events,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,
            reasoning_output_tokens,total_tokens
          ) SELECT
            strftime('%Y-%m-%d', ts, 'unixepoch', 'localtime'), COUNT(*),
            COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
            COALESCE(SUM(cache_read_tokens),0), COALESCE(SUM(cache_write_tokens),0),
            COALESCE(SUM(reasoning_output_tokens),0), COALESCE(SUM(total_tokens),0)
          FROM usage_events WHERE id > ? GROUP BY 1
          ON CONFLICT(day) DO UPDATE SET
            events=events+excluded.events,
            input_tokens=input_tokens+excluded.input_tokens,
            output_tokens=output_tokens+excluded.output_tokens,
            cache_read_tokens=cache_read_tokens+excluded.cache_read_tokens,
            cache_write_tokens=cache_write_tokens+excluded.cache_write_tokens,
            reasoning_output_tokens=reasoning_output_tokens+excluded.reasoning_output_tokens,
            total_tokens=total_tokens+excluded.total_tokens`).run(previous);
          db.prepare(`INSERT INTO usage_meta(key,value) VALUES('daily_rollup_event_id',?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(maximum));
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      } else if (!marker) {
        db.prepare("INSERT OR REPLACE INTO usage_meta(key,value) VALUES('daily_rollup_event_id',?)")
          .run(String(maximum));
      }
    } finally {
      this.dailyRollupSync = false;
    }
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
    const rawInput = Math.max(0, number(usage.input_tokens));
    const rawOutput = Math.max(0, number(usage.output_tokens));
    const cacheRead = Math.min(rawInput, Math.max(0, number(usage.cached_input_tokens)));
    const reasoning = Math.min(rawOutput, Math.max(0, number(usage.reasoning_output_tokens)));
    const input = rawInput - cacheRead;
    const output = rawOutput - reasoning;
    const reported = number(usage.total_tokens);
    const total = reported > 0 ? reported : rawInput + rawOutput;
    if (total <= 0) return null;
    const ts = timestamp(item.timestamp);
    const cumulative = number(payload.info?.total_token_usage?.total_tokens);
    let sourceKey;
    if (cumulative > 0) {
      if (context.codexLastCumulative === cumulative) return null;
      if (context.codexLastCumulative != null && cumulative < context.codexLastCumulative) {
        context.codexCumulativeSegment += 1;
      }
      context.codexLastCumulative = cumulative;
      sourceKey = `codex:${context.sessionId || "unknown"}:${context.codexCumulativeSegment}:${cumulative}`;
    } else {
      sourceKey = `codex:${context.sessionId || "unknown"}:${ts}:${sourceOffset}`;
    }
    return {
      sourceKey,
      ts, sessionId: context.sessionId, model: context.model, cwd: context.cwd,
      input, output, cacheRead, cacheWrite: 0, reasoning, total,
      rawKind: "codex_token_count_v2",
    };
  }

  updateContext(item, context) {
    if (context.tool !== "codex") return;
    if (item?.type === "session_meta") {
      const nextSessionId = item.payload?.id || context.sessionId;
      if (nextSessionId && context.sessionId && nextSessionId !== context.sessionId) {
        context.codexCumulativeSegment += 1;
        context.codexLastCumulative = null;
      }
      context.sessionId = nextSessionId;
      context.cwd = item.payload?.cwd || context.cwd;
      context.model = item.payload?.model || context.model;
    } else if (item?.type === "turn_context") {
      context.model = item.payload?.model || context.model;
      context.cwd = item.payload?.cwd || context.cwd;
    }
  }

  rateLimitSnapshot(item, sourcePath = null) {
    const payload = item?.payload;
    const rateLimits = payload?.type === "token_count" ? payload.rate_limits : null;
    const limitId = typeof rateLimits?.limit_id === "string"
      ? rateLimits.limit_id.trim()
      : "";
    if (!limitId) return null;
    // Only surface the canonical Codex account limit; skip per-model weekly
    // ceilings (e.g. "GPT-5.3-Codex-Spark" reported as codex_<model>) as noise.
    if (limitId !== "codex" && limitId.toLowerCase().startsWith("codex")) return null;
    const window = (value) => value && typeof value === "object" ? {
      usedPercent: optionalNumber(value.used_percent),
      windowMinutes: optionalNumber(value.window_minutes),
      resetsAt: optionalNumber(value.resets_at),
    } : { usedPercent: null, windowMinutes: null, resetsAt: null };
    const primary = window(rateLimits.primary);
    const secondary = window(rateLimits.secondary);
    if (primary.usedPercent === null && secondary.usedPercent === null) return null;
    return {
      limitId,
      limitName: typeof rateLimits.limit_name === "string" && rateLimits.limit_name.trim()
        ? rateLimits.limit_name.trim()
        : null,
      planType: typeof rateLimits.plan_type === "string" && rateLimits.plan_type.trim()
        ? rateLimits.plan_type.trim()
        : null,
      primary,
      secondary,
      hasCredits: Boolean(rateLimits.credits?.has_credits),
      unlimited: Boolean(rateLimits.credits?.unlimited),
      creditBalance: rateLimits.credits?.balance == null
        ? null
        : String(rateLimits.credits.balance),
      sourcePath,
      updatedAt: timestamp(item.timestamp),
    };
  }

  writeRateLimitSnapshot(snapshot) {
    this.db().prepare(`INSERT INTO usage_rate_limits (
      limit_id,limit_name,plan_type,
      primary_used_percent,primary_window_minutes,primary_resets_at,
      secondary_used_percent,secondary_window_minutes,secondary_resets_at,
      has_credits,unlimited,credit_balance,source_path,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(limit_id) DO UPDATE SET
      limit_name=excluded.limit_name,plan_type=excluded.plan_type,
      primary_used_percent=excluded.primary_used_percent,
      primary_window_minutes=excluded.primary_window_minutes,
      primary_resets_at=excluded.primary_resets_at,
      secondary_used_percent=excluded.secondary_used_percent,
      secondary_window_minutes=excluded.secondary_window_minutes,
      secondary_resets_at=excluded.secondary_resets_at,
      has_credits=excluded.has_credits,unlimited=excluded.unlimited,
      credit_balance=excluded.credit_balance,source_path=excluded.source_path,
      updated_at=excluded.updated_at
    WHERE excluded.updated_at >= usage_rate_limits.updated_at`).run(
      snapshot.limitId, snapshot.limitName, snapshot.planType,
      snapshot.primary?.usedPercent ?? null, snapshot.primary?.windowMinutes ?? null,
      snapshot.primary?.resetsAt ?? null,
      snapshot.secondary?.usedPercent ?? null, snapshot.secondary?.windowMinutes ?? null,
      snapshot.secondary?.resetsAt ?? null,
      snapshot.hasCredits ? 1 : 0, snapshot.unlimited ? 1 : 0,
      snapshot.creditBalance, snapshot.sourcePath, snapshot.updatedAt
    );
  }

  captureRateLimits(item, sourcePath = null) {
    const snapshot = this.rateLimitSnapshot(item, sourcePath);
    if (!snapshot) return false;
    const account = this.codexAccountForPath?.(sourcePath);
    if (snapshot.limitId === "codex" && account) {
      snapshot.limitId = `codex:${account.id}`;
      snapshot.limitName = `Codex · ${account.label}`;
    }
    this.writeRateLimitSnapshot(snapshot);
    return true;
  }

  ingestFile(entry, tool) {
    const db = this.db();
    const stat = fs.statSync(entry.path);
    const source = db.prepare(`SELECT session_id sessionId,last_offset lastOffset,
      last_cumulative lastCumulative,cumulative_segment cumulativeSegment
      FROM usage_sources WHERE source_path=?`).get(entry.path);
    let start = Number(source?.lastOffset) || 0;
    let codexLastCumulative = source?.lastCumulative == null
      ? null
      : number(source.lastCumulative);
    let codexCumulativeSegment = Math.max(0, number(source?.cumulativeSegment));
    if (start > stat.size) {
      start = 0;
      codexLastCumulative = null;
      codexCumulativeSegment += 1;
    }
    if (start === stat.size) return 0;
    const fd = fs.openSync(entry.path, "r");
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    const lastNewline = buffer.lastIndexOf(0x0a);
    if (lastNewline < 0) return 0;
    const readable = buffer.subarray(0, lastNewline + 1);
    if (source?.sessionId && entry.sessionId && source.sessionId !== entry.sessionId) {
      codexLastCumulative = null;
      codexCumulativeSegment += 1;
    }
    const context = {
      tool,
      sessionId: entry.sessionId || source?.sessionId,
      cwd: entry.cwd,
      model: null,
      codexLastCumulative,
      codexCumulativeSegment,
    };
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
      this.captureRateLimits(item, entry.path);
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
    db.prepare(`INSERT INTO usage_sources(source_path,tool,session_id,last_offset,last_size,updated_at,
      last_cumulative,cumulative_segment)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source_path) DO UPDATE SET tool=excluded.tool,
      session_id=excluded.session_id,last_offset=excluded.last_offset,last_size=excluded.last_size,
      updated_at=excluded.updated_at,last_cumulative=excluded.last_cumulative,
      cumulative_segment=excluded.cumulative_segment`).run(
        entry.path, tool, context.sessionId ?? null, start + readable.length, stat.size, Date.now(),
        context.codexLastCumulative, context.codexCumulativeSegment
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

  readLatestRateLimit(entry) {
    let fd;
    try {
      const stat = fs.statSync(entry.path);
      const start = Math.max(0, stat.size - RATE_LIMIT_TAIL_BYTES);
      const buffer = Buffer.alloc(stat.size - start);
      fd = fs.openSync(entry.path, "r");
      fs.readSync(fd, buffer, 0, buffer.length, start);
      let text = buffer.toString("utf8");
      if (start > 0) {
        const firstNewline = text.indexOf("\n");
        text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
      }
      const lines = text.split(/\r?\n/);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index].trim();
        if (!line || !line.includes('"rate_limits"')) continue;
        let item;
        try { item = JSON.parse(line); } catch { continue; }
        if (this.captureRateLimits(item, entry.path)) return true;
      }
    } catch {
      // A session may rotate while the latest usage snapshot is being read.
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
    }
    return false;
  }

  async refreshCodexRateLimits() {
    const entries = await this.sessionService.scan("codex");
    const activeSessionIds = new Set(
      this.catalog.agents
        .filter((agent) => agent.aiToolId === "codex" && agent.lastSessionId)
        .map((agent) => String(agent.lastSessionId).toLowerCase())
    );
    const prioritized = [...entries].sort((left, right) => {
      const leftActive = activeSessionIds.has(String(left.sessionId || "").toLowerCase());
      const rightActive = activeSessionIds.has(String(right.sessionId || "").toLowerCase());
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      return Number(right.mtimeMs || 0) - Number(left.mtimeMs || 0);
    });
    for (const entry of prioritized.slice(0, RATE_LIMIT_TRANSCRIPT_LIMIT)) {
      this.readLatestRateLimit(entry);
    }
  }

  readClaudeCredentials() {
    try {
      const oauth = JSON.parse(fs.readFileSync(this.claudeCredentialsPath, "utf8"))?.claudeAiOauth;
      if (!oauth?.accessToken) return null;
      // Expired access tokens return 401; skip and keep the last known snapshot.
      if (Number.isFinite(oauth.expiresAt) && oauth.expiresAt <= Date.now()) return null;
      return { token: String(oauth.accessToken), subscriptionType: oauth.subscriptionType ?? null };
    } catch {
      return null;
    }
  }

  async fetchClaudeUsage() {
    if (this.claudeUsageFetcher) return this.claudeUsageFetcher();
    const creds = this.readClaudeCredentials();
    if (!creds) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLAUDE_USAGE_TIMEOUT_MS);
    try {
      const response = await fetch(CLAUDE_USAGE_URL, {
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "anthropic-beta": "oauth-2025-04-20",
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return { usage: await response.json(), subscriptionType: creds.subscriptionType };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  claudeRateLimitSnapshots(usage, subscriptionType, updatedAt) {
    if (!usage || typeof usage !== "object") return [];
    const resets = (value) => {
      const parsed = value ? Math.floor(Date.parse(value) / 1000) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    };
    const window = (source, windowMinutes) => {
      const usedPercent = optionalNumber(source?.utilization ?? source?.percent);
      if (usedPercent === null) return null;
      return { usedPercent, windowMinutes, resetsAt: resets(source?.resets_at) };
    };
    const snapshots = [];
    const primary = window(usage.five_hour, FIVE_HOUR_MINUTES);
    const secondary = window(usage.seven_day, SEVEN_DAY_MINUTES);
    if (primary || secondary) {
      snapshots.push({
        limitId: "claude",
        limitName: "Claude",
        planType: subscriptionType || null,
        primary,
        secondary,
        hasCredits: Boolean(usage.extra_usage?.is_enabled || usage.spend?.enabled),
        unlimited: false,
        creditBalance: usage.spend?.balance == null ? null : String(usage.spend.balance),
        sourcePath: CLAUDE_USAGE_URL,
        updatedAt,
      });
    }
    // Model-scoped weekly ceilings (e.g. Opus/Fable) surface as their own rows,
    // mirroring how Codex shows an extra row per model limit.
    for (const entry of Array.isArray(usage.limits) ? usage.limits : []) {
      const displayName = typeof entry?.scope?.model?.display_name === "string"
        ? entry.scope.model.display_name.trim()
        : "";
      if (!displayName) continue;
      const usedPercent = optionalNumber(entry.percent);
      if (usedPercent === null) continue;
      const windowMinutes = entry.group === "weekly"
        ? SEVEN_DAY_MINUTES
        : entry.group === "session" ? FIVE_HOUR_MINUTES : null;
      snapshots.push({
        limitId: `claude:${entry.kind || entry.group || "scoped"}:${displayName.toLowerCase()}`,
        limitName: `Claude ${displayName}`,
        planType: subscriptionType || null,
        primary: { usedPercent, windowMinutes, resetsAt: resets(entry.resets_at) },
        secondary: null,
        hasCredits: false,
        unlimited: false,
        creditBalance: null,
        sourcePath: CLAUDE_USAGE_URL,
        updatedAt,
      });
    }
    return snapshots;
  }

  async refreshClaudeRateLimits(force = false) {
    if (this.claudeRateLimitRefresh) return this.claudeRateLimitRefresh;
    if (!force && Date.now() - this.claudeRateLimitFetchedAt < CLAUDE_USAGE_MIN_INTERVAL_MS) {
      return false;
    }
    this.claudeRateLimitRefresh = (async () => {
      const result = await this.fetchClaudeUsage();
      if (!result?.usage) return false;
      this.claudeRateLimitFetchedAt = Date.now();
      const snapshots = this.claudeRateLimitSnapshots(
        result.usage, result.subscriptionType, Math.floor(Date.now() / 1000)
      );
      for (const snapshot of snapshots) this.writeRateLimitSnapshot(snapshot);
      return snapshots.length > 0;
    })().finally(() => { this.claudeRateLimitRefresh = null; });
    return this.claudeRateLimitRefresh;
  }

  async refreshRateLimits() {
    if (this.rateLimitRefresh) return this.rateLimitRefresh;
    this.rateLimitRefresh = (async () => {
      await Promise.allSettled([
        this.refreshCodexRateLimits(),
        this.refreshClaudeRateLimits(true),
      ]);
      return this.rateLimitSummary();
    })().finally(() => {
      this.rateLimitRefresh = null;
    });
    return this.rateLimitRefresh;
  }

  rateLimitSummary() {
    const freshAfter = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const rows = this.db().prepare(`SELECT * FROM usage_rate_limits
      WHERE updated_at >= ? AND limit_id NOT LIKE 'codex\\_%' ESCAPE '\\'
      ORDER BY
      CASE limit_id WHEN 'codex' THEN 0 WHEN 'claude' THEN 1 ELSE 2 END,
      updated_at DESC`).all(freshAfter);
    const rateWindow = (row, prefix) => row[`${prefix}_used_percent`] == null ? null : ({
      usedPercent: Number(row[`${prefix}_used_percent`]),
      windowMinutes: row[`${prefix}_window_minutes`] == null
        ? null
        : Number(row[`${prefix}_window_minutes`]),
      resetsAt: row[`${prefix}_resets_at`] == null
        ? null
        : Number(row[`${prefix}_resets_at`]),
    });
    const limits = rows.map((row) => ({
      limitId: row.limit_id,
      limitName: row.limit_name ?? null,
      planType: row.plan_type ?? null,
      primary: rateWindow(row, "primary"),
      secondary: rateWindow(row, "secondary"),
      credits: {
        hasCredits: Boolean(row.has_credits),
        unlimited: Boolean(row.unlimited),
        balance: row.credit_balance ?? null,
      },
      updatedAt: Number(row.updated_at) * 1000,
    }));
    return {
      updatedAt: limits.reduce((latest, limit) => Math.max(latest, limit.updatedAt), 0),
      limits,
    };
  }

  async getRateLimits(refresh = false) {
    return refresh ? this.refreshRateLimits() : this.rateLimitSummary();
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
    return this.tokenTotals();
  }

  tokenTotals(startAt = null, endAt = null) {
    this.ensureDailyRollup();
    const clauses = [];
    const params = [];
    if (startAt != null && Number.isFinite(Number(startAt))) {
      clauses.push("day >= ?");
      params.push(localDateKey(new Date(Number(startAt))));
    }
    if (endAt != null && Number.isFinite(Number(endAt))) {
      clauses.push("day < ?");
      params.push(localDateKey(new Date(Number(endAt))));
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const totals = this.db().prepare(`SELECT COALESCE(SUM(events),0) events, COALESCE(SUM(input_tokens),0) inputTokens,
      COALESCE(SUM(output_tokens),0) outputTokens, COALESCE(SUM(cache_read_tokens),0) cacheReadTokens,
      COALESCE(SUM(cache_write_tokens),0) cacheWriteTokens,
      COALESCE(SUM(reasoning_output_tokens),0) reasoningOutputTokens,
      COALESCE(SUM(total_tokens),0) totalTokens FROM usage_daily${where}`).get(...params);
    return normalizedTokenTotals(totals);
  }

  tokenBuckets(startAt, endAt, bucket = "day") {
    this.ensureDailyRollup();
    const bucketExpression = bucket === "month" ? "substr(day,1,7)" : "day";
    const rows = this.db().prepare(`SELECT
      ${bucketExpression} bucketKey,
      COALESCE(SUM(events),0) events,
      COALESCE(SUM(input_tokens),0) inputTokens,
      COALESCE(SUM(output_tokens),0) outputTokens,
      COALESCE(SUM(cache_read_tokens),0) cacheReadTokens,
      COALESCE(SUM(cache_write_tokens),0) cacheWriteTokens,
      COALESCE(SUM(reasoning_output_tokens),0) reasoningOutputTokens,
      COALESCE(SUM(total_tokens),0) totalTokens
      FROM usage_daily WHERE day >= ? AND day < ?
      GROUP BY bucketKey ORDER BY bucketKey`).all(
      localDateKey(new Date(Number(startAt))),
      localDateKey(new Date(Number(endAt))),
    );
    return new Map(rows.map((row) => [String(row.bucketKey), normalizedTokenTotals(row)]));
  }

  usageHistory(selection = null, now = Date.now()) {
    const current = new Date(now);
    const selected = usageHistorySelection(selection, current.getTime());
    const currentYear = current.getFullYear();
    const currentMonth = current.getMonth() + 1;
    const currentIsoWeek = isoWeekParts(current);
    const currentWeek = currentIsoWeek.week;

    const rangeFor = (period) => {
      if (period.mode === "year") {
        return {
          start: new Date(period.year, 0, 1),
          end: new Date(period.year + 1, 0, 1),
        };
      }
      if (period.mode === "week") {
        const start = isoWeekStart(period.year, period.week);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return { start, end };
      }
      return {
        start: new Date(period.year, period.month - 1, 1),
        end: new Date(period.year, period.month, 1),
      };
    };
    const adjacent = (period, direction) => {
      const result = { ...period };
      if (result.mode === "year") result.year += direction;
      if (result.mode === "month") {
        result.month += direction;
        if (result.month < 1) { result.month = 12; result.year -= 1; }
        if (result.month > 12) { result.month = 1; result.year += 1; }
      }
      if (result.mode === "week") {
        result.week += direction;
        if (result.week < 1) {
          result.year -= 1;
          result.week = isoWeeksInYear(result.year);
        } else if (result.week > isoWeeksInYear(result.year)) {
          result.year += 1;
          result.week = 1;
        }
      }
      return result;
    };
    const selectedRange = rangeFor(selected);
    const previous = adjacent(selected, -1);
    const previousRange = rangeFor(previous);
    const totals = this.tokenTotals(selectedRange.start.getTime(), selectedRange.end.getTime());
    const previousTotals = this.tokenTotals(previousRange.start.getTime(), previousRange.end.getTime());
    const buckets = [];

    if (selected.mode === "year") {
      const totalsByMonth = this.tokenBuckets(selectedRange.start.getTime(), selectedRange.end.getTime(), "month");
      for (let month = 1; month <= 12; month += 1) {
        const key = `${selected.year}-${String(month).padStart(2, "0")}`;
        buckets.push({ key, label: `${month}월`, ...normalizedTokenTotals(totalsByMonth.get(key)) });
      }
    } else {
      const totalsByDate = this.tokenBuckets(selectedRange.start.getTime(), selectedRange.end.getTime());
      for (let date = new Date(selectedRange.start); date < selectedRange.end; date.setDate(date.getDate() + 1)) {
        const key = localDateKey(date);
        buckets.push({ key, label: selected.mode === "week"
          ? `${date.getMonth() + 1}/${date.getDate()}`
          : `${date.getDate()}일`, ...normalizedTokenTotals(totalsByDate.get(key)) });
      }
    }

    const yearStart = new Date(selected.year, 0, 1);
    const yearEnd = new Date(selected.year + 1, 0, 1);
    const monthlyTotals = this.tokenBuckets(yearStart.getTime(), yearEnd.getTime(), "month");
    const quickBuckets = [];
    if (selected.mode === "week") {
      const firstWeekStart = isoWeekStart(selected.year, 1);
      const lastWeekEnd = isoWeekStart(selected.year, isoWeeksInYear(selected.year));
      lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
      const dailyTotals = this.tokenBuckets(firstWeekStart.getTime(), lastWeekEnd.getTime());
      for (let week = 1; week <= isoWeeksInYear(selected.year); week += 1) {
        const start = isoWeekStart(selected.year, week);
        const rows = [];
        for (let offset = 0; offset < 7; offset += 1) {
          const date = new Date(start);
          date.setDate(date.getDate() + offset);
          rows.push(dailyTotals.get(localDateKey(date)));
        }
        quickBuckets.push({ value: week, label: `${week}주`, ...sumTokenTotals(rows) });
      }
    } else {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${selected.year}-${String(month).padStart(2, "0")}`;
        quickBuckets.push({ value: month, label: `${month}월`, ...normalizedTokenTotals(monthlyTotals.get(key)) });
      }
    }

    this.ensureDailyRollup();
    const earliestDay = this.db().prepare("SELECT MIN(day) earliest FROM usage_daily").get()?.earliest;
    const earliestYear = typeof earliestDay === "string"
      ? Number(earliestDay.slice(0, 4)) || currentYear
      : currentYear;
    const latestSelectionYear = selected.mode === "week" ? currentIsoWeek.year : currentYear;
    const endDisplay = new Date(selectedRange.end);
    endDisplay.setDate(endDisplay.getDate() - 1);
    const todayEnd = new Date(current);
    todayEnd.setHours(23, 59, 59, 999);
    const displayedEnd = endDisplay > todayEnd ? current : endDisplay;

    return {
      selection: selected,
      current: { year: currentYear, month: currentMonth, week: currentWeek, weekYear: currentIsoWeek.year },
      availableYears: Array.from(
        { length: Math.max(1, latestSelectionYear - Math.max(2000, earliestYear) + 1) },
        (_, index) => latestSelectionYear - index,
      ),
      range: {
        startAt: selectedRange.start.getTime(),
        endAt: selectedRange.end.getTime(),
        startDate: localDateKey(selectedRange.start),
        endDate: localDateKey(displayedEnd),
      },
      totals,
      previous: { selection: previous, totals: previousTotals },
      buckets,
      quickBuckets,
    };
  }

  usageOverview(now = Date.now()) {
    const current = new Date(now);
    if (!Number.isFinite(current.getTime())) throw new TypeError("usage overview requires a valid date");

    const dayStart = new Date(current);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
    const tomorrow = new Date(dayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const timelineStart = new Date(dayStart);
    timelineStart.setDate(timelineStart.getDate() - 29);

    this.ensureDailyRollup();
    const rows = this.db().prepare(`SELECT day date, events,
      input_tokens inputTokens, output_tokens outputTokens,
      cache_read_tokens cacheReadTokens, cache_write_tokens cacheWriteTokens,
      reasoning_output_tokens reasoningOutputTokens, total_tokens totalTokens
      FROM usage_daily WHERE day >= ? AND day < ? ORDER BY day`).all(
      localDateKey(timelineStart),
      localDateKey(tomorrow),
    );
    const totalsByDate = new Map(rows.map((row) => [String(row.date), normalizedTokenTotals(row)]));
    const timeline = [];
    for (let offset = 0; offset < 30; offset += 1) {
      const date = new Date(timelineStart);
      date.setDate(date.getDate() + offset);
      const key = localDateKey(date);
      timeline.push({ date: key, ...normalizedTokenTotals(totalsByDate.get(key)) });
    }

    return {
      periods: {
        day: this.tokenTotals(dayStart.getTime(), tomorrow.getTime()),
        week: this.tokenTotals(weekStart.getTime(), tomorrow.getTime()),
        month: this.tokenTotals(monthStart.getTime(), tomorrow.getTime()),
      },
      timeline,
    };
  }

  close() {
    this.database?.close();
    this.database = null;
  }
}
