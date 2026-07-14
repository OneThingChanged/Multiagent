use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Path as AxumPath, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::AppState;

const PAGE: &str = include_str!("monitor_dashboard.html");
const DEFAULT_PORT: u16 = 4421;
const FALLBACK_PORT_START: u16 = 4421;
const FALLBACK_PORT_END: u16 = 4499;
const MAX_DOC_FILES: usize = 400;
const MAX_DOC_RESULTS: usize = 32;
const MAX_DOC_BYTES: u64 = 3 * 1024 * 1024;

#[derive(Clone, Default)]
struct MonitorCatalog {
    projects: Vec<MonitorProjectInfo>,
    agents: Vec<MonitorAgentInfo>,
    groups: Vec<MonitorGroupInfo>,
    view: MonitorViewInfo,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct MonitorProjectInfo {
    pub id: String,
    pub name: String,
    pub folder: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorAgentInfo {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub folder: String,
    pub ai_tool_id: String,
    pub status: Option<String>,
    pub last_session_id: Option<String>,
    pub ssh_host_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorGroupInfo {
    pub id: String,
    pub project_id: Option<String>,
    pub layout: serde_json::Value,
    pub session_pins: Option<serde_json::Value>,
    pub session_locked: Option<bool>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorViewInfo {
    pub active_project_id: Option<String>,
    pub active_group_id: Option<String>,
    pub active_path: Option<Vec<usize>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct MonitorConfig {
    pub enabled: bool,
    pub server_port: u16,
}

impl Default for MonitorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            server_port: DEFAULT_PORT,
        }
    }
}

#[derive(Serialize)]
pub struct MonitorStatus {
    pub running: bool,
    pub url: Option<String>,
    pub port: Option<u16>,
}

struct MonitorServerInfo {
    port: u16,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorHookState {
    pub event: String,
    pub last_ts: i64,
    pub session_id: Option<String>,
    pub transcript_path: Option<String>,
    pub cwd: Option<String>,
}

pub struct MonitorHub {
    catalog: Mutex<MonitorCatalog>,
    hooks: Mutex<HashMap<String, MonitorHookState>>,
    server: Mutex<Option<MonitorServerInfo>>,
    handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    config: Mutex<MonitorConfig>,
    config_path: Mutex<Option<PathBuf>>,
}

impl MonitorHub {
    pub fn new() -> Self {
        Self {
            catalog: Mutex::new(MonitorCatalog::default()),
            hooks: Mutex::new(HashMap::new()),
            server: Mutex::new(None),
            handle: Mutex::new(None),
            config: Mutex::new(MonitorConfig::default()),
            config_path: Mutex::new(None),
        }
    }

    pub fn sync_state(
        &self,
        projects: Vec<MonitorProjectInfo>,
        agents: Vec<MonitorAgentInfo>,
        groups: Vec<MonitorGroupInfo>,
        view: MonitorViewInfo,
    ) {
        *self.catalog.lock().unwrap() = MonitorCatalog {
            projects,
            agents,
            groups,
            view,
        };
    }

    pub fn note_hook(
        &self,
        agent_id: String,
        event: String,
        session_id: Option<String>,
        transcript_path: Option<String>,
        cwd: Option<String>,
    ) {
        if agent_id.trim().is_empty() || event.trim().is_empty() {
            return;
        }
        self.hooks.lock().unwrap().insert(
            agent_id,
            MonitorHookState {
                event,
                last_ts: Utc::now().timestamp_millis(),
                session_id,
                transcript_path,
                cwd,
            },
        );
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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorDashboardState {
    generated_at: i64,
    active_project_id: Option<String>,
    active_group_id: Option<String>,
    active_agent_id: Option<String>,
    projects: Vec<MonitorProjectInfo>,
    groups: Vec<MonitorGroupInfo>,
    sessions: Vec<MonitorSession>,
    totals: MonitorTotals,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorTotals {
    live: usize,
    working: usize,
    hook_missing: usize,
    docs: usize,
    total_tokens: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorSession {
    id: String,
    name: String,
    project_id: String,
    project_name: String,
    folder: String,
    ai_tool_id: String,
    frontend_status: String,
    effective_status: String,
    live: bool,
    active: bool,
    group_ids: Vec<String>,
    last_session_id: Option<String>,
    hook: Option<MonitorHookState>,
    usage: Option<MonitorUsageSummary>,
    docs: Vec<MonitorDocFile>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorUsageSummary {
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    reasoning_output_tokens: i64,
    total_tokens: i64,
    last_ts: Option<i64>,
    model: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HookReconnectResult {
    agent_id: String,
    tool: String,
    folder: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookRepairFailure {
    agent_id: String,
    name: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookRepairSummary {
    active_sessions: usize,
    supported_sessions: usize,
    repaired: usize,
    already_healthy: usize,
    skipped: usize,
    restart_required: usize,
    server_restarted: bool,
    failures: Vec<HookRepairFailure>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorDocFile {
    name: String,
    relative_path: String,
    path: String,
    kind: String,
    size: u64,
    modified_ts: Option<i64>,
    score: i32,
    badges: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorDocContent {
    name: String,
    path: String,
    kind: String,
    content: String,
}

pub fn load(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let config_path = dir.join("monitor-config.json");
    if let Ok(raw) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<MonitorConfig>(&raw) {
            *state.monitor.config.lock().unwrap() = sanitize_config(config);
        }
    }
    *state.monitor.config_path.lock().unwrap() = Some(config_path);
    Ok(())
}

pub fn config_get(hub: &MonitorHub) -> MonitorConfig {
    hub.config.lock().unwrap().clone()
}

pub fn config_set(hub: &MonitorHub, config: MonitorConfig) -> MonitorConfig {
    {
        let mut current = hub.config.lock().unwrap();
        *current = sanitize_config(config);
    }
    hub.save_config();
    config_get(hub)
}

pub fn status(hub: &MonitorHub) -> MonitorStatus {
    match &*hub.server.lock().unwrap() {
        Some(info) => MonitorStatus {
            running: true,
            url: Some(make_url(info.port)),
            port: Some(info.port),
        },
        None => MonitorStatus {
            running: false,
            url: None,
            port: None,
        },
    }
}

pub async fn start(app: AppHandle) -> Result<MonitorStatus, String> {
    let existing_port = {
        let state = app.state::<AppState>();
        let port = state
            .monitor
            .server
            .lock()
            .unwrap()
            .as_ref()
            .map(|info| info.port);
        port
    };
    if let Some(port) = existing_port {
        return Ok(MonitorStatus {
            running: true,
            url: Some(make_url(port)),
            port: Some(port),
        });
    }

    let configured_port = {
        let state = app.state::<AppState>();
        let port = state.monitor.config.lock().unwrap().server_port;
        port
    };
    let (listener, port) = bind_monitor_listener(configured_port).await?;
    if port != configured_port {
        let state = app.state::<AppState>();
        {
            let mut config = state.monitor.config.lock().unwrap();
            config.server_port = port;
        }
        state.monitor.save_config();
    }
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let router = Router::new()
        .route("/", get(page))
        .route("/api/state", get(api_state))
        .route("/api/docs/read", get(read_doc))
        .route("/api/docs/html", get(html_doc))
        .route("/api/docs/asset/{root}/{*asset_path}", get(doc_asset))
        .route("/api/hooks/reconnect", post(reconnect_hooks))
        .route("/api/usage/summary", get(usage_summary))
        .route("/api/usage/projects", get(usage_projects))
        .route("/api/usage/sessions", get(usage_sessions))
        .route("/api/usage/timeseries", get(usage_timeseries))
        .route("/api/usage/recent", get(usage_recent))
        .route("/api/usage/reindex", post(usage_reindex))
        .with_state(app.clone());

    let handle = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    let state = app.state::<AppState>();
    *state.monitor.server.lock().unwrap() = Some(MonitorServerInfo { port });
    *state.monitor.handle.lock().unwrap() = Some(handle);

    Ok(MonitorStatus {
        running: true,
        url: Some(make_url(port)),
        port: Some(port),
    })
}

pub fn stop(app: &AppHandle) -> MonitorStatus {
    let state = app.state::<AppState>();
    if let Some(handle) = state.monitor.handle.lock().unwrap().take() {
        handle.abort();
    }
    *state.monitor.server.lock().unwrap() = None;
    MonitorStatus {
        running: false,
        url: None,
        port: None,
    }
}

fn sanitize_config(mut config: MonitorConfig) -> MonitorConfig {
    if config.server_port == 0 {
        config.server_port = DEFAULT_PORT;
    }
    config
}

fn make_url(port: u16) -> String {
    format!("http://127.0.0.1:{}", port)
}

async fn bind_monitor_listener(
    configured_port: u16,
) -> Result<(tokio::net::TcpListener, u16), String> {
    let mut candidates = Vec::new();
    push_port_candidate(&mut candidates, configured_port);
    push_port_candidate(&mut candidates, DEFAULT_PORT);
    for port in FALLBACK_PORT_START..=FALLBACK_PORT_END {
        push_port_candidate(&mut candidates, port);
    }

    let mut first_error = None;
    for port in candidates {
        match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => return Ok((listener, port)),
            Err(err) => {
                if first_error.is_none() {
                    first_error = Some(err.to_string());
                }
            }
        }
    }

    Err(format!(
        "bind monitor dashboard port {} failed: {}; no fallback port available in {}-{}",
        configured_port,
        first_error.unwrap_or_else(|| "unknown error".to_string()),
        FALLBACK_PORT_START,
        FALLBACK_PORT_END
    ))
}

fn push_port_candidate(candidates: &mut Vec<u16>, port: u16) {
    if port > 0 && !candidates.contains(&port) {
        candidates.push(port);
    }
}

async fn page() -> Html<&'static str> {
    Html(PAGE)
}

async fn api_state(State(app): State<AppHandle>) -> Response {
    json_result(build_dashboard_state(&app))
}

async fn read_doc(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let path = q.get("path").map(String::as_str).unwrap_or("");
    let state = app.state::<AppState>();
    let projects = state.monitor.catalog.lock().unwrap().projects.clone();
    json_result(read_doc_file(&projects, path))
}

async fn html_doc(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let path = q.get("path").map(String::as_str).unwrap_or("");
    let state = app.state::<AppState>();
    let projects = state.monitor.catalog.lock().unwrap().projects.clone();
    match read_html_file(&projects, path) {
        Ok(content) => Html(content).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

async fn doc_asset(
    State(app): State<AppHandle>,
    AxumPath((root, asset_path)): AxumPath<(String, String)>,
) -> Response {
    let state = app.state::<AppState>();
    let projects = state.monitor.catalog.lock().unwrap().projects.clone();
    match read_doc_asset(&projects, &root, &asset_path) {
        Ok((content_type, bytes)) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, content_type)],
            bytes,
        )
            .into_response(),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

async fn reconnect_hooks(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let agent_id = q.get("agentId").map(String::as_str).unwrap_or("");
    json_result(reconnect_agent_hooks(&app, agent_id))
}

async fn usage_summary(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let project_id = query_project_id(&q);
    let hub = app.state::<AppState>().usage.clone();
    json_result(hub.summary(range, project_id))
}

async fn usage_projects(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let hub = app.state::<AppState>().usage.clone();
    json_result(
        hub.projects(range)
            .map(|projects| serde_json::json!({ "projects": projects })),
    )
}

async fn usage_sessions(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let project_id = query_project_id(&q);
    let hub = app.state::<AppState>().usage.clone();
    json_result(
        hub.sessions(range, project_id)
            .map(|sessions| serde_json::json!({ "sessions": sessions })),
    )
}

async fn usage_timeseries(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let range = q.get("range").map(String::as_str).unwrap_or("today");
    let bucket = q.get("bucket").map(String::as_str).unwrap_or("hour");
    let project_id = query_project_id(&q);
    let hub = app.state::<AppState>().usage.clone();
    json_result(
        hub.timeseries(range, bucket, project_id)
            .map(|buckets| serde_json::json!({ "buckets": buckets })),
    )
}

async fn usage_recent(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
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

async fn usage_reindex(State(app): State<AppHandle>) -> Response {
    let hub = app.state::<AppState>().usage.clone();
    Json(hub.ingest_known_now()).into_response()
}

fn query_project_id(q: &HashMap<String, String>) -> Option<&str> {
    q.get("projectId")
        .map(String::as_str)
        .filter(|value| !value.is_empty())
}

fn build_dashboard_state(app: &AppHandle) -> Result<MonitorDashboardState, String> {
    let state = app.state::<AppState>();
    let catalog = state.monitor.catalog.lock().unwrap().clone();
    let hooks = state.monitor.hooks.lock().unwrap().clone();
    let mut live_ids: HashSet<String> = state.ptys.lock().unwrap().keys().cloned().collect();
    live_ids.extend(live_lock_ids(app, &live_ids));
    let usage_by_agent = usage_by_agent(&state);

    let project_names: HashMap<String, String> = catalog
        .projects
        .iter()
        .map(|project| (project.id.clone(), project.name.clone()))
        .collect();

    let active_agent_id = catalog
        .view
        .active_group_id
        .as_deref()
        .and_then(|group_id| catalog.groups.iter().find(|group| group.id == group_id))
        .and_then(|group| {
            catalog
                .view
                .active_path
                .as_deref()
                .and_then(|path| active_agent_from_layout(&group.layout, path))
                .or_else(|| first_agent_from_layout(&group.layout))
        });

    let now = Utc::now().timestamp_millis();
    let mut sessions = Vec::new();
    for agent in &catalog.agents {
        let hook = hooks.get(&agent.id).cloned();
        let usage = usage_by_agent.get(&agent.id).cloned();
        let live = live_ids.contains(&agent.id);
        let active = active_agent_id.as_deref() == Some(agent.id.as_str());
        let frontend_status = agent.status.clone().unwrap_or_else(|| "idle".to_string());
        let effective_status = effective_status(live, &frontend_status, hook.as_ref(), now);
        let group_ids = catalog
            .groups
            .iter()
            .filter(|group| layout_contains_agent(&group.layout, &agent.id))
            .map(|group| group.id.clone())
            .collect();
        let docs = scan_docs(agent);
        sessions.push(MonitorSession {
            id: agent.id.clone(),
            name: agent.name.clone(),
            project_id: agent.project_id.clone(),
            project_name: project_names
                .get(&agent.project_id)
                .cloned()
                .unwrap_or_else(|| "(unknown)".to_string()),
            folder: agent.folder.clone(),
            ai_tool_id: agent.ai_tool_id.clone(),
            frontend_status,
            effective_status,
            live,
            active,
            group_ids,
            last_session_id: hook
                .as_ref()
                .and_then(|h| h.session_id.clone())
                .or_else(|| agent.last_session_id.clone()),
            hook,
            usage,
            docs,
        });
    }

    sessions.sort_by(|a, b| {
        b.active
            .cmp(&a.active)
            .then_with(|| b.live.cmp(&a.live))
            .then_with(|| status_rank(&b.effective_status).cmp(&status_rank(&a.effective_status)))
            .then_with(|| {
                a.project_name
                    .to_lowercase()
                    .cmp(&b.project_name.to_lowercase())
            })
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let totals = MonitorTotals {
        live: sessions.iter().filter(|session| session.live).count(),
        working: sessions
            .iter()
            .filter(|session| session.effective_status == "working")
            .count(),
        hook_missing: sessions
            .iter()
            .filter(|session| session.effective_status == "hook-missing")
            .count(),
        docs: sessions.iter().map(|session| session.docs.len()).sum(),
        total_tokens: sessions
            .iter()
            .map(|session| {
                session
                    .usage
                    .as_ref()
                    .map(|usage| usage.total_tokens)
                    .unwrap_or(0)
            })
            .sum(),
    };

    Ok(MonitorDashboardState {
        generated_at: now,
        active_project_id: catalog.view.active_project_id,
        active_group_id: catalog.view.active_group_id,
        active_agent_id,
        projects: catalog.projects,
        groups: catalog.groups,
        sessions,
        totals,
    })
}

fn usage_by_agent(state: &AppState) -> HashMap<String, MonitorUsageSummary> {
    let mut out = HashMap::new();
    let Ok(rows) = state.usage.sessions("all", None) else {
        return out;
    };
    for row in rows {
        let Some(agent_id) = row.agent_id else {
            continue;
        };
        let entry = out
            .entry(agent_id)
            .or_insert_with(MonitorUsageSummary::default);
        entry.input_tokens += row.input_tokens;
        entry.output_tokens += row.output_tokens;
        entry.cache_read_tokens += row.cache_read_tokens;
        entry.cache_write_tokens += row.cache_write_tokens;
        entry.reasoning_output_tokens += row.reasoning_output_tokens;
        entry.total_tokens += row.total_tokens;
        if row.last_ts > entry.last_ts {
            entry.last_ts = row.last_ts;
            entry.model = row.model;
        }
    }
    out
}

fn reconnect_agent_hooks(app: &AppHandle, agent_id: &str) -> Result<HookReconnectResult, String> {
    if agent_id.trim().is_empty() {
        return Err("agentId is required".to_string());
    }
    let state = app.state::<AppState>();
    let agent = state
        .monitor
        .catalog
        .lock()
        .unwrap()
        .agents
        .iter()
        .find(|candidate| candidate.id == agent_id)
        .cloned()
        .ok_or_else(|| "agent not found".to_string())?;
    if agent.folder.trim().is_empty() {
        return Err("agent folder is missing".to_string());
    }
    if agent.ssh_host_id.is_some() {
        return Err("remote hook reconnect requires reopening the SSH session".to_string());
    }

    crate::refresh_hook_runtime(app)?;
    match agent.ai_tool_id.as_str() {
        "claude" => crate::setup_claude_hooks(&agent.folder, &state.hook_info.helper_path)?,
        "codex" => crate::setup_codex_hooks(&agent.folder, &state.hook_info.helper_path)?,
        _ => return Err("hooks are supported only for Claude and Codex sessions".to_string()),
    }

    state.monitor.note_hook(
        agent.id.clone(),
        "hooks-reconnected".to_string(),
        agent.last_session_id.clone(),
        None,
        Some(agent.folder.clone()),
    );

    Ok(HookReconnectResult {
        agent_id: agent.id,
        tool: agent.ai_tool_id,
        folder: agent.folder,
        message: "hooks reconnected for future CLI hook events".to_string(),
    })
}

fn hook_settings_current(agent: &MonitorAgentInfo, helper_path: &str) -> Result<bool, String> {
    let (settings_path, merged) = match agent.ai_tool_id.as_str() {
        "claude" => {
            let path = Path::new(&agent.folder)
                .join(".claude")
                .join("settings.local.json");
            let existing = fs::read_to_string(&path).unwrap_or_default();
            let merged = crate::merge_claude_settings(&existing, helper_path)?;
            (path, (existing, merged))
        }
        "codex" => {
            let path = Path::new(&agent.folder).join(".codex").join("config.toml");
            let existing = fs::read_to_string(&path).unwrap_or_default();
            let merged = crate::merge_codex_config(&existing, helper_path)?;
            (path, (existing, merged))
        }
        _ => return Ok(true),
    };
    Ok(settings_path.exists() && merged.0 == merged.1)
}

pub fn repair_active_hooks(app: &AppHandle) -> Result<HookRepairSummary, String> {
    let server_restarted = crate::refresh_hook_runtime(app)?;
    let state = app.state::<AppState>();
    let live_ids: HashSet<String> = state.ptys.lock().unwrap().keys().cloned().collect();
    let agents = state.monitor.catalog.lock().unwrap().agents.clone();
    let helper_path = state.hook_info.helper_path.clone();
    let mut seen = HashSet::new();
    let mut summary = HookRepairSummary {
        active_sessions: live_ids.len(),
        supported_sessions: 0,
        repaired: 0,
        already_healthy: 0,
        skipped: 0,
        restart_required: 0,
        server_restarted,
        failures: Vec::new(),
    };

    for agent in agents.iter().filter(|agent| live_ids.contains(&agent.id)) {
        seen.insert(agent.id.clone());
        if agent.ai_tool_id != "claude" && agent.ai_tool_id != "codex" {
            summary.skipped += 1;
            continue;
        }
        summary.supported_sessions += 1;
        if agent.ssh_host_id.is_some() {
            // An existing SSH reverse tunnel is pinned to the hook server port
            // selected at spawn, so a remote process must be reopened if that
            // connection itself is stale.
            summary.restart_required += 1;
            continue;
        }
        if agent.folder.trim().is_empty() {
            summary.failures.push(HookRepairFailure {
                agent_id: agent.id.clone(),
                name: agent.name.clone(),
                message: "프로젝트 폴더가 없습니다.".to_string(),
            });
            continue;
        }

        let was_current = hook_settings_current(agent, &helper_path).unwrap_or(false);
        let result = match agent.ai_tool_id.as_str() {
            "claude" => crate::setup_claude_hooks(&agent.folder, &helper_path),
            "codex" => crate::setup_codex_hooks(&agent.folder, &helper_path),
            _ => Ok(()),
        };
        match result {
            Ok(()) => {
                if was_current {
                    summary.already_healthy += 1;
                } else {
                    summary.repaired += 1;
                }
                state.monitor.note_hook(
                    agent.id.clone(),
                    "hooks-reconnected".to_string(),
                    agent.last_session_id.clone(),
                    None,
                    Some(agent.folder.clone()),
                );
            }
            Err(message) => summary.failures.push(HookRepairFailure {
                agent_id: agent.id.clone(),
                name: agent.name.clone(),
                message,
            }),
        }
    }

    for id in live_ids.difference(&seen) {
        summary.failures.push(HookRepairFailure {
            agent_id: id.clone(),
            name: id.clone(),
            message: "활성 PTY와 세션 목록이 아직 동기화되지 않았습니다.".to_string(),
        });
    }

    Ok(summary)
}

fn effective_status(
    live: bool,
    frontend_status: &str,
    hook: Option<&MonitorHookState>,
    now: i64,
) -> String {
    if live {
        if frontend_status == "working" || hook.map(|h| h.event.as_str()) == Some("working") {
            return "working".to_string();
        }
        if hook.is_none() {
            return "hook-missing".to_string();
        }
        if hook.map(|h| h.event.as_str()) == Some("done") {
            return "live-done".to_string();
        }
        return "live".to_string();
    }
    if let Some(hook) = hook {
        if now.saturating_sub(hook.last_ts) < 10 * 60 * 1000 {
            return "stale".to_string();
        }
    }
    frontend_status.to_string()
}

fn status_rank(status: &str) -> i32 {
    match status {
        "working" => 6,
        "hook-missing" => 5,
        "live" => 4,
        "live-done" => 3,
        "running" => 2,
        "stale" => 1,
        _ => 0,
    }
}

fn live_lock_ids(app: &AppHandle, local_pty_ids: &HashSet<String>) -> HashSet<String> {
    let mut ids = HashSet::new();
    let Ok(dir) = app.path().app_local_data_dir() else {
        return ids;
    };
    let dir = dir.join("session-locks");
    let Ok(entries) = fs::read_dir(dir) else {
        return ids;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("lock") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        if local_pty_ids.contains(id) {
            continue;
        }
        let Ok(file) = OpenOptions::new().read(true).write(true).open(&path) else {
            continue;
        };
        match file.try_lock_exclusive() {
            Ok(()) => {
                let _ = file.unlock();
            }
            Err(_) => {
                ids.insert(id.to_string());
            }
        }
    }
    ids
}

fn active_agent_from_layout(layout: &serde_json::Value, path: &[usize]) -> Option<String> {
    let mut node = layout;
    for idx in path {
        node = node.get("children")?.get(*idx)?;
    }
    agent_from_leaf(node)
}

fn first_agent_from_layout(layout: &serde_json::Value) -> Option<String> {
    if let Some(agent) = agent_from_leaf(layout) {
        return Some(agent);
    }
    let children = layout.get("children")?.as_array()?;
    for child in children {
        if let Some(agent) = first_agent_from_layout(child) {
            return Some(agent);
        }
    }
    None
}

fn agent_from_leaf(node: &serde_json::Value) -> Option<String> {
    if node.get("type").and_then(|value| value.as_str()) != Some("leaf") {
        return None;
    }
    let tabs = node.get("tabs")?.as_array()?;
    let active_index = node
        .get("activeIndex")
        .and_then(|value| value.as_u64())
        .unwrap_or(0) as usize;
    tabs.get(active_index)
        .or_else(|| tabs.first())
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn layout_contains_agent(layout: &serde_json::Value, agent_id: &str) -> bool {
    if layout
        .get("tabs")
        .and_then(|value| value.as_array())
        .map(|tabs| tabs.iter().any(|value| value.as_str() == Some(agent_id)))
        .unwrap_or(false)
    {
        return true;
    }
    layout
        .get("children")
        .and_then(|value| value.as_array())
        .map(|children| {
            children
                .iter()
                .any(|child| layout_contains_agent(child, agent_id))
        })
        .unwrap_or(false)
}

fn scan_docs(agent: &MonitorAgentInfo) -> Vec<MonitorDocFile> {
    let mut files = Vec::new();
    for docs_dir in candidate_docs_dirs(&agent.folder) {
        collect_doc_files(&docs_dir, &docs_dir, agent, &mut files);
        if files.len() >= MAX_DOC_FILES {
            break;
        }
    }
    let mut seen = HashSet::new();
    files.retain(|file| {
        let key = canonical_path_key(Path::new(&file.path));
        seen.insert(key)
    });
    files.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| b.modified_ts.cmp(&a.modified_ts))
            .then_with(|| {
                a.relative_path
                    .to_lowercase()
                    .cmp(&b.relative_path.to_lowercase())
            })
    });
    files.truncate(MAX_DOC_RESULTS);
    files
}

fn collect_doc_files(
    docs_dir: &Path,
    dir: &Path,
    agent: &MonitorAgentInfo,
    out: &mut Vec<MonitorDocFile>,
) {
    if out.len() >= MAX_DOC_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= MAX_DOC_FILES {
            return;
        }
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            collect_doc_files(docs_dir, &path, agent, out);
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let Some(kind) = doc_kind(&path) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let relative_path = path
            .strip_prefix(docs_dir)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('/', "\\");
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        let (score, badges) = doc_score(&relative_path, &name, agent, kind);
        out.push(MonitorDocFile {
            name,
            relative_path,
            path: path.to_string_lossy().to_string(),
            kind: kind.to_string(),
            size: metadata.len(),
            modified_ts: metadata.modified().ok().and_then(system_time_ms),
            score,
            badges,
        });
    }
}

fn candidate_docs_dirs(folder: &str) -> Vec<PathBuf> {
    if folder.trim().is_empty() {
        return Vec::new();
    }
    let root = PathBuf::from(folder);
    let mut seen = HashSet::new();
    let mut dirs = Vec::new();
    for name in ["docs", "Docs", "DOCS"] {
        let path = root.join(name);
        if !path.is_dir() {
            continue;
        }
        let key = canonical_path_key(&path);
        if seen.insert(key) {
            dirs.push(path);
        }
    }
    dirs
}

fn canonical_path_key(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn doc_kind(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("md") | Some("markdown") => Some("markdown"),
        Some("html") | Some("htm") => Some("html"),
        _ => None,
    }
}

fn doc_score(
    relative_path: &str,
    name: &str,
    agent: &MonitorAgentInfo,
    kind: &str,
) -> (i32, Vec<String>) {
    let mut score = 0;
    let mut badges = vec![kind.to_string()];
    let key = search_key(&format!("{} {}", relative_path, name));
    let lower = relative_path.to_ascii_lowercase();
    let file_lower = name.to_ascii_lowercase();
    let agent_key = search_key(&agent.name);

    if !agent_key.is_empty() && key.contains(&agent_key) {
        score += 600;
        badges.push(agent.name.clone());
    }
    if lower.contains("current") {
        score += 500;
        badges.push("current".to_string());
    }
    if lower.contains("plan") {
        score += 450;
        badges.push("plan".to_string());
    }
    if lower.contains("todo") {
        score += 430;
        badges.push("todo".to_string());
    }
    if lower.contains("phase") {
        score += 410;
        badges.push("phase".to_string());
    }
    if lower.contains("roadmap") {
        score += 390;
        badges.push("roadmap".to_string());
    }
    if file_lower == "readme.md" {
        score += 180;
        badges.push("readme".to_string());
    }
    if lower.contains("overview") || lower.contains("architecture") {
        score += 120;
    }
    if kind == "markdown" {
        score += 30;
    }
    (score, badges)
}

fn read_doc_file(
    projects: &[MonitorProjectInfo],
    raw_path: &str,
) -> Result<MonitorDocContent, String> {
    if raw_path.trim().is_empty() {
        return Err("path is required".to_string());
    }
    let path = PathBuf::from(raw_path);
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    let kind = doc_kind(&canonical).ok_or_else(|| "unsupported document type".to_string())?;
    if !is_allowed_doc_path(projects, &canonical) {
        return Err("document is outside known project docs folders".to_string());
    }
    let metadata = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_DOC_BYTES {
        return Err("document is too large to preview".to_string());
    }
    let bytes = fs::read(&canonical).map_err(|e| e.to_string())?;
    let content = String::from_utf8_lossy(&bytes).to_string();
    Ok(MonitorDocContent {
        name: canonical
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string(),
        path: canonical.to_string_lossy().to_string(),
        kind: kind.to_string(),
        content,
    })
}

fn read_html_file(projects: &[MonitorProjectInfo], raw_path: &str) -> Result<String, String> {
    if raw_path.trim().is_empty() {
        return Err("path is required".to_string());
    }
    let path = PathBuf::from(raw_path);
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if doc_kind(&canonical) != Some("html") {
        return Err("document is not an HTML file".to_string());
    }
    if !is_allowed_doc_path(projects, &canonical) {
        return Err("document is outside known project docs folders".to_string());
    }
    let metadata = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_DOC_BYTES {
        return Err("document is too large to preview".to_string());
    }
    let bytes = fs::read(&canonical).map_err(|e| e.to_string())?;
    let content = String::from_utf8_lossy(&bytes).to_string();
    let docs_root = allowed_docs_root_for_path(projects, &canonical)
        .ok_or_else(|| "document docs root is missing".to_string())?;
    let parent = canonical
        .parent()
        .ok_or_else(|| "document parent folder is missing".to_string())?;
    let token = encode_path_token(&docs_root);
    let relative_parent = parent.strip_prefix(&docs_root).unwrap_or(Path::new(""));
    let relative_parent_url = relative_path_url(relative_parent);
    let base_href = if relative_parent_url.is_empty() {
        format!("/api/docs/asset/{}/", token)
    } else {
        format!("/api/docs/asset/{}/{}/", token, relative_parent_url)
    };
    let base = format!(r#"<base href="{}">"#, base_href);
    Ok(inject_html_base(&content, &base))
}

fn read_doc_asset(
    projects: &[MonitorProjectInfo],
    root_token: &str,
    raw_asset_path: &str,
) -> Result<(&'static str, Vec<u8>), String> {
    let root = decode_path_token(root_token)?;
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    if !is_allowed_docs_dir(projects, &canonical_root) {
        return Err("asset root is outside known project docs folders".to_string());
    }
    let asset_rel = PathBuf::from(raw_asset_path);
    if !is_safe_relative_path(&asset_rel) {
        return Err("asset path is not allowed".to_string());
    }
    let asset = canonical_root.join(asset_rel);
    let canonical_asset = asset.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_asset.starts_with(&canonical_root) {
        return Err("asset path escaped its document folder".to_string());
    }
    if !is_allowed_docs_dir(projects, &canonical_asset) {
        return Err("asset is outside known project docs folders".to_string());
    }
    let metadata = fs::metadata(&canonical_asset).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("asset is not a file".to_string());
    }
    if metadata.len() > 25 * 1024 * 1024 {
        return Err("asset is too large to preview".to_string());
    }
    let content_type = asset_content_type(&canonical_asset);
    let bytes = fs::read(&canonical_asset).map_err(|e| e.to_string())?;
    Ok((content_type, bytes))
}

fn inject_html_base(content: &str, base: &str) -> String {
    let lower = content.to_ascii_lowercase();
    if let Some(head_start) = lower.find("<head") {
        if let Some(head_end) = content[head_start..].find('>') {
            let insert_at = head_start + head_end + 1;
            let mut out = String::with_capacity(content.len() + base.len());
            out.push_str(&content[..insert_at]);
            out.push_str(base);
            out.push_str(&content[insert_at..]);
            return out;
        }
    }
    format!(
        "<!doctype html><html><head>{}</head><body>{}</body></html>",
        base, content
    )
}

fn encode_path_token(path: &Path) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(path.to_string_lossy().as_bytes())
}

fn decode_path_token(token: &str) -> Result<PathBuf, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(token.as_bytes())
        .map_err(|e| e.to_string())?;
    let path = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    Ok(PathBuf::from(path))
}

fn is_safe_relative_path(path: &Path) -> bool {
    use std::path::Component;
    !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn is_allowed_doc_path(projects: &[MonitorProjectInfo], path: &Path) -> bool {
    allowed_docs_root_for_path(projects, path).is_some()
}

fn allowed_docs_root_for_path(projects: &[MonitorProjectInfo], path: &Path) -> Option<PathBuf> {
    for project in projects {
        for docs_dir in candidate_docs_dirs(&project.folder) {
            if let Ok(canonical_docs_dir) = docs_dir.canonicalize() {
                if path.starts_with(&canonical_docs_dir) {
                    return Some(canonical_docs_dir);
                }
            }
        }
    }
    None
}

fn is_allowed_docs_dir(projects: &[MonitorProjectInfo], path: &Path) -> bool {
    for project in projects {
        for docs_dir in candidate_docs_dirs(&project.folder) {
            if let Ok(canonical_docs_dir) = docs_dir.canonicalize() {
                if path.starts_with(canonical_docs_dir) {
                    return true;
                }
            }
        }
    }
    false
}

fn asset_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("css") => "text/css; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("json") => "application/json",
        Some("txt") | Some("md") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn relative_path_url(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            std::path::Component::Normal(value) => value.to_str().map(url_path_segment),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn url_path_segment(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        let keep = byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'.' | b'_' | b'~');
        if keep {
            out.push(*byte as char);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}

fn system_time_ms(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as i64)
}

fn search_key(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn json_result<T: Serialize>(result: Result<T, String>) -> Response {
    match result {
        Ok(value) => Json(value).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}
