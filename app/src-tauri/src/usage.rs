use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::SystemTime;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Local, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::AppState;

const PAGE: &str = include_str!("usage_dashboard.html");
const DEFAULT_PORT: u16 = 3004;

#[derive(Clone, Default)]
struct UsageCatalog {
    projects: Vec<UsageProjectInfo>,
    agents: Vec<UsageAgentInfo>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct UsageProjectInfo {
    pub id: String,
    pub name: String,
    pub folder: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageAgentInfo {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub folder: String,
    pub ai_tool_id: String,
    pub last_session_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct UsageConfig {
    pub enabled: bool,
    pub server_port: u16,
}

impl Default for UsageConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            server_port: DEFAULT_PORT,
        }
    }
}

#[derive(Serialize)]
pub struct UsageStatus {
    pub running: bool,
    pub url: Option<String>,
    pub port: Option<u16>,
}

struct UsageServerInfo {
    port: u16,
}

pub struct UsageHub {
    catalog: Mutex<UsageCatalog>,
    sessions: Mutex<HashMap<String, String>>,
    server: Mutex<Option<UsageServerInfo>>,
    handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    config: Mutex<UsageConfig>,
    config_path: Mutex<Option<PathBuf>>,
    db_path: Mutex<Option<PathBuf>>,
}

impl UsageHub {
    pub fn new() -> Self {
        Self {
            catalog: Mutex::new(UsageCatalog::default()),
            sessions: Mutex::new(HashMap::new()),
            server: Mutex::new(None),
            handle: Mutex::new(None),
            config: Mutex::new(UsageConfig::default()),
            config_path: Mutex::new(None),
            db_path: Mutex::new(None),
        }
    }

    pub fn sync_catalog(&self, projects: Vec<UsageProjectInfo>, agents: Vec<UsageAgentInfo>) {
        *self.catalog.lock().unwrap() = UsageCatalog { projects, agents };
    }

    pub fn note_session(&self, agent_id: &str, session_id: &str) {
        if agent_id.is_empty() || session_id.is_empty() {
            return;
        }
        self.sessions
            .lock()
            .unwrap()
            .insert(agent_id.to_string(), session_id.to_string());
    }

    pub fn ingest_agent(self: &Arc<Self>, agent_id: String, transcript_path: Option<String>) {
        let hub = self.clone();
        thread::spawn(move || {
            let _ = hub.ingest_agent_now(&agent_id, transcript_path);
        });
    }

    fn connection(&self) -> Result<Connection, String> {
        let path = self
            .db_path
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "usage database is not initialized".to_string())?;
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        ensure_schema(&conn)?;
        Ok(conn)
    }

    fn save_config(&self) {
        let path = self.config_path.lock().unwrap().clone();
        if let Some(path) = path {
            let config = self.config.lock().unwrap().clone();
            if let Ok(json) = serde_json::to_string_pretty(&config) {
                let _ = fs::write(path, json);
            }
        }
    }

    fn ingest_agent_now(
        &self,
        agent_id: &str,
        transcript_path: Option<String>,
    ) -> Result<IngestSummary, String> {
        let catalog = self.catalog.lock().unwrap().clone();
        let agent = catalog
            .agents
            .iter()
            .find(|candidate| candidate.id == agent_id)
            .cloned()
            .ok_or_else(|| "usage agent metadata not found".to_string())?;
        let project = catalog
            .projects
            .iter()
            .find(|candidate| candidate.id == agent.project_id)
            .cloned();
        let session_id = self
            .sessions
            .lock()
            .unwrap()
            .get(agent_id)
            .cloned()
            .or_else(|| agent.last_session_id.clone());
        let path = self.resolve_transcript_path(
            &agent.ai_tool_id,
            session_id.as_deref(),
            transcript_path.as_deref(),
        )?;
        self.ingest_file(&agent, project.as_ref(), session_id.as_deref(), &path)
    }

    fn ingest_file(
        &self,
        agent: &UsageAgentInfo,
        project: Option<&UsageProjectInfo>,
        session_id_hint: Option<&str>,
        path: &Path,
    ) -> Result<IngestSummary, String> {
        let conn = self.connection()?;
        let path_string = path.to_string_lossy().to_string();
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        let size = metadata.len() as i64;
        let (mut offset, last_size) = source_progress(&conn, &path_string)?;
        if last_size > size {
            offset = 0;
        }

        let mut file = File::open(path).map_err(|e| e.to_string())?;
        file.seek(SeekFrom::Start(offset as u64))
            .map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(file);
        let mut line = String::new();
        let mut inserted = 0usize;
        let mut session_id = session_id_hint.map(str::to_string);
        let mut model: Option<String> = None;

        loop {
            line.clear();
            let bytes = reader.read_line(&mut line).map_err(|e| e.to_string())?;
            if bytes == 0 {
                break;
            }
            offset += bytes as i64;
            let raw = line.trim();
            if raw.is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
                continue;
            };
            if agent.ai_tool_id == "codex" {
                update_codex_context(&value, &mut session_id, &mut model);
            }
            if let Some(event) = usage_event_from_json(
                &value,
                agent,
                project,
                session_id.as_deref(),
                model.as_deref(),
                &path_string,
                offset,
            ) {
                inserted += insert_event(&conn, &event)?;
            }
        }

        save_source_progress(
            &conn,
            &path_string,
            &agent.ai_tool_id,
            session_id.as_deref(),
            offset,
            size,
        )?;

        Ok(IngestSummary {
            files: 1,
            events: inserted,
            errors: Vec::new(),
        })
    }

    fn resolve_transcript_path(
        &self,
        tool: &str,
        session_id: Option<&str>,
        transcript_path: Option<&str>,
    ) -> Result<PathBuf, String> {
        if let Some(path) = transcript_path.filter(|p| !p.trim().is_empty()) {
            if let Ok(path) = self.allowed_source_path(tool, Path::new(path)) {
                return Ok(path);
            }
        }
        let session_id = session_id.ok_or_else(|| "session id is missing".to_string())?;
        let root = source_root(tool)?;
        find_session_file(&root, tool, session_id)
            .ok_or_else(|| format!("usage transcript not found for {}", session_id))
            .and_then(|path| self.allowed_source_path(tool, &path))
    }

    fn allowed_source_path(&self, tool: &str, path: &Path) -> Result<PathBuf, String> {
        let root = source_root(tool)?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let canonical = path.canonicalize().map_err(|e| e.to_string())?;
        if !canonical.starts_with(&root) {
            return Err("usage transcript is outside the allowed CLI directory".to_string());
        }
        if canonical.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            return Err("usage transcript is not a JSONL file".to_string());
        }
        Ok(canonical)
    }

    pub fn ingest_known_now(&self) -> IngestSummary {
        let agents = self.catalog.lock().unwrap().agents.clone();
        let mut summary = IngestSummary {
            files: 0,
            events: 0,
            errors: Vec::new(),
        };
        for agent in agents {
            if agent.ai_tool_id != "claude" && agent.ai_tool_id != "codex" {
                continue;
            }
            match self.ingest_agent_now(&agent.id, None) {
                Ok(next) => {
                    summary.files += next.files;
                    summary.events += next.events;
                }
                Err(err) => summary.errors.push(format!("{}: {}", agent.name, err)),
            }
        }
        summary
    }

    fn summary(&self, range: &str, project_id: Option<&str>) -> Result<UsageSummary, String> {
        let conn = self.connection()?;
        let since = range_start(range);
        conn.query_row(
            "SELECT
                COALESCE(SUM(input_tokens), 0),
                COALESCE(SUM(output_tokens), 0),
                COALESCE(SUM(cache_read_tokens), 0),
                COALESCE(SUM(cache_write_tokens), 0),
                COALESCE(SUM(reasoning_output_tokens), 0),
                COALESCE(SUM(total_tokens), 0),
                COUNT(*)
             FROM usage_events
             WHERE ts >= ?1 AND (?2 IS NULL OR project_id = ?2)",
            params![since, project_id],
            |row| {
                Ok(UsageSummary {
                    input_tokens: row.get(0)?,
                    output_tokens: row.get(1)?,
                    cache_read_tokens: row.get(2)?,
                    cache_write_tokens: row.get(3)?,
                    reasoning_output_tokens: row.get(4)?,
                    total_tokens: row.get(5)?,
                    events: row.get(6)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    fn projects(&self, range: &str) -> Result<Vec<ProjectUsage>, String> {
        let conn = self.connection()?;
        let since = range_start(range);
        let mut stmt = conn
            .prepare(
                "SELECT
                    project_id,
                    COALESCE(project_name, '(unknown)'),
                    COALESCE(SUM(input_tokens), 0),
                    COALESCE(SUM(output_tokens), 0),
                    COALESCE(SUM(cache_read_tokens), 0),
                    COALESCE(SUM(cache_write_tokens), 0),
                    COALESCE(SUM(reasoning_output_tokens), 0),
                    COALESCE(SUM(total_tokens), 0),
                    COUNT(DISTINCT COALESCE(agent_id, '') || ':' || COALESCE(session_id, '')),
                    MAX(ts)
                 FROM usage_events
                 WHERE ts >= ?1
                 GROUP BY project_id, project_name
                 ORDER BY SUM(total_tokens) DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![since], |row| {
                Ok(ProjectUsage {
                    project_id: row.get(0)?,
                    project_name: row.get(1)?,
                    input_tokens: row.get(2)?,
                    output_tokens: row.get(3)?,
                    cache_read_tokens: row.get(4)?,
                    cache_write_tokens: row.get(5)?,
                    reasoning_output_tokens: row.get(6)?,
                    total_tokens: row.get(7)?,
                    session_count: row.get(8)?,
                    last_ts: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        collect_rows(rows)
    }

    fn sessions(&self, range: &str, project_id: Option<&str>) -> Result<Vec<SessionUsage>, String> {
        let conn = self.connection()?;
        let since = range_start(range);
        let sql = "SELECT
                project_id,
                COALESCE(project_name, '(unknown)'),
                agent_id,
                COALESCE(agent_name, '(unknown)'),
                session_id,
                tool,
                model,
                COALESCE(SUM(input_tokens), 0),
                COALESCE(SUM(output_tokens), 0),
                COALESCE(SUM(cache_read_tokens), 0),
                COALESCE(SUM(cache_write_tokens), 0),
                COALESCE(SUM(reasoning_output_tokens), 0),
                COALESCE(SUM(total_tokens), 0),
                MAX(ts)
             FROM usage_events
             WHERE ts >= ?1 AND (?2 IS NULL OR project_id = ?2)
             GROUP BY project_id, project_name, agent_id, agent_name, session_id, tool, model
             ORDER BY SUM(total_tokens) DESC";
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![since, project_id], |row| {
                Ok(SessionUsage {
                    project_id: row.get(0)?,
                    project_name: row.get(1)?,
                    agent_id: row.get(2)?,
                    agent_name: row.get(3)?,
                    session_id: row.get(4)?,
                    tool: row.get(5)?,
                    model: row.get(6)?,
                    input_tokens: row.get(7)?,
                    output_tokens: row.get(8)?,
                    cache_read_tokens: row.get(9)?,
                    cache_write_tokens: row.get(10)?,
                    reasoning_output_tokens: row.get(11)?,
                    total_tokens: row.get(12)?,
                    last_ts: row.get(13)?,
                })
            })
            .map_err(|e| e.to_string())?;
        collect_rows(rows)
    }

    fn timeseries(
        &self,
        range: &str,
        bucket: &str,
        project_id: Option<&str>,
    ) -> Result<Vec<UsageBucket>, String> {
        let conn = self.connection()?;
        let since = range_start(range);
        let seconds = if bucket == "hour" { 3600 } else { 86400 };
        let mut stmt = conn
            .prepare(
                "SELECT
                    (ts / ?1) * ?1 AS bucket_ts,
                    COALESCE(SUM(input_tokens), 0),
                    COALESCE(SUM(output_tokens), 0),
                    COALESCE(SUM(cache_read_tokens), 0),
                    COALESCE(SUM(cache_write_tokens), 0),
                    COALESCE(SUM(reasoning_output_tokens), 0),
                    COALESCE(SUM(total_tokens), 0)
                 FROM usage_events
                 WHERE ts >= ?2 AND (?3 IS NULL OR project_id = ?3)
                 GROUP BY bucket_ts
                 ORDER BY bucket_ts ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![seconds, since, project_id], |row| {
                Ok(UsageBucket {
                    ts: row.get(0)?,
                    input_tokens: row.get(1)?,
                    output_tokens: row.get(2)?,
                    cache_read_tokens: row.get(3)?,
                    cache_write_tokens: row.get(4)?,
                    reasoning_output_tokens: row.get(5)?,
                    total_tokens: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        collect_rows(rows)
    }

    fn recent(
        &self,
        range: &str,
        limit: i64,
        project_id: Option<&str>,
    ) -> Result<Vec<RecentUsage>, String> {
        let conn = self.connection()?;
        let since = range_start(range);
        let limit = limit.clamp(1, 500);
        let mut stmt = conn
            .prepare(
                "SELECT
                    ts,
                    project_id,
                    project_name,
                    agent_name,
                    session_id,
                    tool,
                    model,
                    input_tokens,
                    output_tokens,
                    cache_read_tokens,
                    cache_write_tokens,
                    reasoning_output_tokens,
                    total_tokens,
                    cwd
                 FROM usage_events
                 WHERE ts >= ?1 AND (?2 IS NULL OR project_id = ?2)
                 ORDER BY ts DESC, id DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![since, project_id, limit], |row| {
                Ok(RecentUsage {
                    ts: row.get(0)?,
                    project_id: row.get(1)?,
                    project_name: row.get(2)?,
                    agent_name: row.get(3)?,
                    session_id: row.get(4)?,
                    tool: row.get(5)?,
                    model: row.get(6)?,
                    input_tokens: row.get(7)?,
                    output_tokens: row.get(8)?,
                    cache_read_tokens: row.get(9)?,
                    cache_write_tokens: row.get(10)?,
                    reasoning_output_tokens: row.get(11)?,
                    total_tokens: row.get(12)?,
                    cwd: row.get(13)?,
                })
            })
            .map_err(|e| e.to_string())?;
        collect_rows(rows)
    }
}

#[derive(Clone)]
struct UsageEvent {
    source_key: String,
    ts: i64,
    project_id: Option<String>,
    project_name: Option<String>,
    agent_id: String,
    agent_name: String,
    session_id: Option<String>,
    tool: String,
    model: Option<String>,
    cwd: Option<String>,
    source_path: String,
    source_offset: i64,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_output_tokens: i64,
    total_tokens: i64,
    raw_kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestSummary {
    pub files: usize,
    pub events: usize,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageSummary {
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_output_tokens: i64,
    total_tokens: i64,
    events: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectUsage {
    project_id: Option<String>,
    project_name: String,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_output_tokens: i64,
    total_tokens: i64,
    session_count: i64,
    last_ts: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionUsage {
    project_id: Option<String>,
    project_name: String,
    agent_id: Option<String>,
    agent_name: String,
    session_id: Option<String>,
    tool: String,
    model: Option<String>,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_output_tokens: i64,
    total_tokens: i64,
    last_ts: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageBucket {
    ts: i64,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_output_tokens: i64,
    total_tokens: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecentUsage {
    ts: i64,
    project_id: Option<String>,
    project_name: Option<String>,
    agent_name: Option<String>,
    session_id: Option<String>,
    tool: String,
    model: Option<String>,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_output_tokens: i64,
    total_tokens: i64,
    cwd: Option<String>,
}

pub fn load(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let db_path = dir.join("usage.db");
    {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        ensure_schema(&conn)?;
    }
    *state.usage.db_path.lock().unwrap() = Some(db_path);

    let config_path = dir.join("usage-config.json");
    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<UsageConfig>(&raw) {
            *state.usage.config.lock().unwrap() = sanitize_config(config);
        }
    }
    *state.usage.config_path.lock().unwrap() = Some(config_path);
    Ok(())
}

pub fn config_get(hub: &UsageHub) -> UsageConfig {
    hub.config.lock().unwrap().clone()
}

pub fn config_set(hub: &UsageHub, config: UsageConfig) -> UsageConfig {
    {
        let mut current = hub.config.lock().unwrap();
        *current = sanitize_config(config);
    }
    hub.save_config();
    config_get(hub)
}

pub fn status(hub: &UsageHub) -> UsageStatus {
    match &*hub.server.lock().unwrap() {
        Some(info) => UsageStatus {
            running: true,
            url: Some(make_url(info.port)),
            port: Some(info.port),
        },
        None => UsageStatus {
            running: false,
            url: None,
            port: None,
        },
    }
}

pub async fn start(app: AppHandle) -> Result<UsageStatus, String> {
    let existing_port = {
        let state = app.state::<AppState>();
        let port = state
            .usage
            .server
            .lock()
            .unwrap()
            .as_ref()
            .map(|info| info.port);
        port
    };
    if let Some(port) = existing_port {
        return Ok(UsageStatus {
            running: true,
            url: Some(make_url(port)),
            port: Some(port),
        });
    }

    let configured_port = {
        let state = app.state::<AppState>();
        let config = state.usage.config.lock().unwrap();
        config.server_port
    };
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", configured_port))
        .await
        .map_err(|e| format!("bind usage dashboard port {} failed: {}", configured_port, e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let router = Router::new()
        .route("/", get(page))
        .route("/api/summary", get(summary))
        .route("/api/projects", get(projects))
        .route("/api/sessions", get(sessions))
        .route("/api/timeseries", get(timeseries))
        .route("/api/recent", get(recent))
        .route("/api/reindex", post(reindex))
        .with_state(app.clone());

    let handle = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    let state = app.state::<AppState>();
    *state.usage.server.lock().unwrap() = Some(UsageServerInfo { port });
    *state.usage.handle.lock().unwrap() = Some(handle);

    Ok(UsageStatus {
        running: true,
        url: Some(make_url(port)),
        port: Some(port),
    })
}

pub fn stop(app: &AppHandle) -> UsageStatus {
    let state = app.state::<AppState>();
    if let Some(handle) = state.usage.handle.lock().unwrap().take() {
        handle.abort();
    }
    *state.usage.server.lock().unwrap() = None;
    UsageStatus {
        running: false,
        url: None,
        port: None,
    }
}

fn sanitize_config(mut config: UsageConfig) -> UsageConfig {
    if config.server_port == 0 {
        config.server_port = DEFAULT_PORT;
    }
    config
}

fn make_url(port: u16) -> String {
    format!("http://127.0.0.1:{}", port)
}

async fn page() -> Html<&'static str> {
    Html(PAGE)
}

async fn summary(State(app): State<AppHandle>, Query(q): Query<HashMap<String, String>>) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let project_id = query_project_id(&q);
    let hub = app.state::<AppState>().usage.clone();
    json_result(
        hub.summary(range, project_id)
            .map(|summary| serde_json::json!(summary)),
    )
}

async fn projects(State(app): State<AppHandle>, Query(q): Query<HashMap<String, String>>) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let hub = app.state::<AppState>().usage.clone();
    json_result(
        hub.projects(range)
            .map(|projects| serde_json::json!({ "projects": projects })),
    )
}

async fn sessions(State(app): State<AppHandle>, Query(q): Query<HashMap<String, String>>) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let project_id = query_project_id(&q);
    let hub = app.state::<AppState>().usage.clone();
    json_result(
        hub.sessions(range, project_id)
            .map(|sessions| serde_json::json!({ "sessions": sessions })),
    )
}

async fn timeseries(State(app): State<AppHandle>, Query(q): Query<HashMap<String, String>>) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let bucket = q.get("bucket").map(String::as_str).unwrap_or("hour");
    let project_id = query_project_id(&q);
    let hub = app.state::<AppState>().usage.clone();
    json_result(
        hub.timeseries(range, bucket, project_id)
            .map(|buckets| serde_json::json!({ "buckets": buckets })),
    )
}

async fn recent(State(app): State<AppHandle>, Query(q): Query<HashMap<String, String>>) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let limit = q
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(100);
    let project_id = query_project_id(&q);
    let hub = app.state::<AppState>().usage.clone();
    json_result(
        hub.recent(range, limit, project_id)
            .map(|events| serde_json::json!({ "events": events })),
    )
}

async fn reindex(State(app): State<AppHandle>) -> Response {
    let hub = app.state::<AppState>().usage.clone();
    Json(hub.ingest_known_now()).into_response()
}

fn json_result(result: Result<serde_json::Value, String>) -> Response {
    match result {
        Ok(value) => Json(value).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

fn query_project_id(q: &HashMap<String, String>) -> Option<&str> {
    q.get("projectId")
        .map(String::as_str)
        .filter(|value| !value.is_empty())
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS usage_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_key TEXT NOT NULL UNIQUE,
          ts INTEGER NOT NULL,
          project_id TEXT,
          project_name TEXT,
          agent_id TEXT,
          agent_name TEXT,
          session_id TEXT,
          tool TEXT NOT NULL,
          model TEXT,
          cwd TEXT,
          source_path TEXT,
          source_offset INTEGER,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens INTEGER NOT NULL DEFAULT 0,
          cache_write_tokens INTEGER NOT NULL DEFAULT 0,
          reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          raw_kind TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usage_sources (
          source_path TEXT PRIMARY KEY,
          tool TEXT NOT NULL,
          session_id TEXT,
          last_offset INTEGER NOT NULL DEFAULT 0,
          last_size INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_events_ts ON usage_events(ts);
        CREATE INDEX IF NOT EXISTS idx_usage_events_project ON usage_events(project_id, ts);
        CREATE INDEX IF NOT EXISTS idx_usage_events_agent ON usage_events(agent_id, ts);
        CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id, ts);
        ",
    )
    .map_err(|e| e.to_string())
}

fn source_progress(conn: &Connection, path: &str) -> Result<(i64, i64), String> {
    conn.query_row(
        "SELECT last_offset, last_size FROM usage_sources WHERE source_path = ?1",
        params![path],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|row| row.unwrap_or((0, 0)))
}

fn save_source_progress(
    conn: &Connection,
    path: &str,
    tool: &str,
    session_id: Option<&str>,
    offset: i64,
    size: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO usage_sources (
            source_path, tool, session_id, last_offset, last_size, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(source_path) DO UPDATE SET
            tool = excluded.tool,
            session_id = excluded.session_id,
            last_offset = excluded.last_offset,
            last_size = excluded.last_size,
            updated_at = excluded.updated_at",
        params![path, tool, session_id, offset, size, Utc::now().timestamp()],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn insert_event(conn: &Connection, event: &UsageEvent) -> Result<usize, String> {
    conn.execute(
        "INSERT OR IGNORE INTO usage_events (
            source_key, ts, project_id, project_name, agent_id, agent_name,
            session_id, tool, model, cwd, source_path, source_offset,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            reasoning_output_tokens, total_tokens, raw_kind
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
            ?13, ?14, ?15, ?16, ?17, ?18, ?19
         )",
        params![
            &event.source_key,
            event.ts,
            &event.project_id,
            &event.project_name,
            &event.agent_id,
            &event.agent_name,
            &event.session_id,
            &event.tool,
            &event.model,
            &event.cwd,
            &event.source_path,
            event.source_offset,
            event.input_tokens,
            event.output_tokens,
            event.cache_read_tokens,
            event.cache_write_tokens,
            event.reasoning_output_tokens,
            event.total_tokens,
            &event.raw_kind,
        ],
    )
    .map_err(|e| e.to_string())
}

fn usage_event_from_json(
    value: &serde_json::Value,
    agent: &UsageAgentInfo,
    project: Option<&UsageProjectInfo>,
    session_id_hint: Option<&str>,
    model_hint: Option<&str>,
    source_path: &str,
    source_offset: i64,
) -> Option<UsageEvent> {
    match agent.ai_tool_id.as_str() {
        "claude" => claude_event_from_json(value, agent, project, source_path, source_offset),
        "codex" => codex_event_from_json(
            value,
            agent,
            project,
            session_id_hint,
            model_hint,
            source_path,
            source_offset,
        ),
        _ => None,
    }
}

fn claude_event_from_json(
    value: &serde_json::Value,
    agent: &UsageAgentInfo,
    project: Option<&UsageProjectInfo>,
    source_path: &str,
    source_offset: i64,
) -> Option<UsageEvent> {
    let message = value.get("message")?;
    let usage = message.get("usage")?;
    let session_id = string_field(value, "sessionId");
    let request_key = string_field(value, "requestId")
        .or_else(|| string_field(message, "id"))
        .or_else(|| string_field(value, "uuid"))
        .unwrap_or_else(|| source_offset.to_string());
    let input = number_field(usage, "input_tokens");
    let output = number_field(usage, "output_tokens");
    let cache_write = number_field(usage, "cache_creation_input_tokens");
    let cache_read = number_field(usage, "cache_read_input_tokens");
    let total = input + output + cache_write + cache_read;
    if total <= 0 {
        return None;
    }
    Some(UsageEvent {
        source_key: format!(
            "claude:{}:{}",
            session_id.as_deref().unwrap_or("unknown"),
            request_key
        ),
        ts: timestamp_field(value).unwrap_or_else(|| Utc::now().timestamp()),
        project_id: project.map(|p| p.id.clone()),
        project_name: project.map(|p| p.name.clone()),
        agent_id: agent.id.clone(),
        agent_name: agent.name.clone(),
        session_id,
        tool: agent.ai_tool_id.clone(),
        model: string_field(message, "model"),
        cwd: string_field(value, "cwd").or_else(|| Some(agent.folder.clone())),
        source_path: source_path.to_string(),
        source_offset,
        input_tokens: input,
        output_tokens: output,
        cache_read_tokens: cache_read,
        cache_write_tokens: cache_write,
        reasoning_output_tokens: 0,
        total_tokens: total,
        raw_kind: "claude_message_usage".to_string(),
    })
}

fn codex_event_from_json(
    value: &serde_json::Value,
    agent: &UsageAgentInfo,
    project: Option<&UsageProjectInfo>,
    session_id_hint: Option<&str>,
    model_hint: Option<&str>,
    source_path: &str,
    source_offset: i64,
) -> Option<UsageEvent> {
    if value.get("type").and_then(|v| v.as_str()) != Some("event_msg") {
        return None;
    }
    let payload = value.get("payload")?;
    if payload.get("type").and_then(|v| v.as_str()) != Some("token_count") {
        return None;
    }
    let info = payload.get("info")?;
    let usage = info.get("last_token_usage")?;
    let total_usage = info.get("total_token_usage");
    let session_id = session_id_hint.map(str::to_string);
    let timestamp = timestamp_field(value).unwrap_or_else(|| Utc::now().timestamp());
    let input = number_field(usage, "input_tokens");
    let output = number_field(usage, "output_tokens");
    let cache_read = number_field(usage, "cached_input_tokens");
    let reasoning = number_field(usage, "reasoning_output_tokens");
    let reported_total = number_field(usage, "total_tokens");
    let total = if reported_total > 0 {
        reported_total + cache_read + reasoning
    } else {
        input + output + cache_read + reasoning
    };
    if total <= 0 {
        return None;
    }
    let cumulative_total = total_usage
        .map(|v| number_field(v, "total_tokens"))
        .unwrap_or(source_offset);
    Some(UsageEvent {
        source_key: format!(
            "codex:{}:{}:{}",
            session_id.as_deref().unwrap_or("unknown"),
            timestamp,
            cumulative_total
        ),
        ts: timestamp,
        project_id: project.map(|p| p.id.clone()),
        project_name: project.map(|p| p.name.clone()),
        agent_id: agent.id.clone(),
        agent_name: agent.name.clone(),
        session_id,
        tool: agent.ai_tool_id.clone(),
        model: model_hint.map(str::to_string),
        cwd: Some(agent.folder.clone()),
        source_path: source_path.to_string(),
        source_offset,
        input_tokens: input,
        output_tokens: output,
        cache_read_tokens: cache_read,
        cache_write_tokens: 0,
        reasoning_output_tokens: reasoning,
        total_tokens: total,
        raw_kind: "codex_token_count".to_string(),
    })
}

fn update_codex_context(
    value: &serde_json::Value,
    session_id: &mut Option<String>,
    model: &mut Option<String>,
) {
    match value.get("type").and_then(|v| v.as_str()) {
        Some("session_meta") => {
            if let Some(payload) = value.get("payload") {
                if session_id.is_none() {
                    *session_id = string_field(payload, "id");
                }
                if model.is_none() {
                    *model = string_field(payload, "model");
                }
            }
        }
        Some("turn_context") => {
            if let Some(payload) = value.get("payload") {
                if model.is_none() {
                    *model = string_field(payload, "model");
                }
            }
        }
        _ => {}
    }
}

fn string_field(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn number_field(value: &serde_json::Value, key: &str) -> i64 {
    value.get(key).and_then(|v| v.as_i64()).unwrap_or(0)
}

fn timestamp_field(value: &serde_json::Value) -> Option<i64> {
    let raw = value.get("timestamp")?.as_str()?;
    parse_timestamp(raw)
}

fn parse_timestamp(raw: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(raw)
        .map(|dt| dt.timestamp())
        .ok()
}

fn source_root(tool: &str) -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "user profile directory not found".to_string())?;
    match tool {
        "claude" => Ok(PathBuf::from(home).join(".claude").join("projects")),
        "codex" => Ok(PathBuf::from(home).join(".codex").join("sessions")),
        _ => Err("unsupported usage tool".to_string()),
    }
}

fn find_session_file(root: &Path, tool: &str, session_id: &str) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    let mut best: Option<(PathBuf, SystemTime)> = None;
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push(path);
                continue;
            }
            if !file_type.is_file() || path.extension().and_then(|e| e.to_str()) != Some("jsonl")
            {
                continue;
            }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let matched = match tool {
                "claude" => name == format!("{}.jsonl", session_id),
                "codex" => name.contains(session_id),
                _ => false,
            };
            if !matched {
                continue;
            }
            let modified = entry
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            match &best {
                Some((_, best_time)) if *best_time >= modified => {}
                _ => best = Some((path, modified)),
            }
        }
    }
    best.map(|(path, _)| path)
}

fn collect_rows<T>(
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>>,
) -> Result<Vec<T>, String> {
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn range_start(range: &str) -> i64 {
    let now = Utc::now().timestamp();
    match range {
        "today" => {
            let today = Local::now().date_naive();
            today
                .and_hms_opt(0, 0, 0)
                .and_then(|naive| Local.from_local_datetime(&naive).single())
                .map(|dt| dt.timestamp())
                .unwrap_or(now - 24 * 60 * 60)
        }
        "week" => now - 7 * 24 * 60 * 60,
        "month" => now - 30 * 24 * 60 * 60,
        "all" => 0,
        _ => now - 24 * 60 * 60,
    }
}
