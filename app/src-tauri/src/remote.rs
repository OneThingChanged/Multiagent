use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;
use std::time::{Duration as StdDuration, SystemTime};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::AppState;

const PAGE: &str = include_str!("remote_page.html");
const LOGIN_PAGE: &str = include_str!("remote_login.html");
const MAX_BUFFER: usize = 128 * 1024;

const SESSION_TTL: StdDuration = StdDuration::from_secs(7 * 24 * 60 * 60);

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct RemoteConfig {
    /// GitHub OAuth App client ID (Device Flow enabled).
    pub client_id: String,
    /// GitHub username that is always allowed without approval.
    pub owner: String,
    /// Cloudflare named-tunnel token. Empty = use a quick tunnel.
    #[serde(default)]
    pub tunnel_token: String,
    /// Public hostname mapped to the tunnel (e.g. agent.example.com).
    #[serde(default)]
    pub public_hostname: String,
    /// Fixed local server port. 0 = random. Must match the tunnel's
    /// service URL when a named tunnel is used.
    #[serde(default)]
    pub server_port: u16,
    /// GitHub OAuth App client secret. When set (together with
    /// public_hostname), login uses the redirect web flow instead of
    /// Device Flow. Never sent to browsers.
    #[serde(default)]
    pub client_secret: String,
}

struct Session {
    user: String,
    expires: SystemTime,
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct AccessStore {
    pub pending: Vec<String>,
    pub approved: Vec<String>,
}

#[derive(PartialEq)]
enum AccessLevel {
    Owner,
    Approved,
    Pending,
    Unknown,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct RemoteAgentInfo {
    pub id: String,
    pub name: String,
    pub project: String,
    pub status: String,
    pub tool: String,
}

pub struct ServerInfo {
    pub port: u16,
    pub token: String,
}

pub struct RemoteHub {
    pub agents: Mutex<Vec<RemoteAgentInfo>>,
    pub view: Mutex<String>,
    buffers: Mutex<HashMap<String, Vec<u8>>>,
    tx: tokio::sync::broadcast::Sender<(String, Vec<u8>)>,
    server: Mutex<Option<ServerInfo>>,
    handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    tunnel_child: Mutex<Option<std::process::Child>>,
    tunnel_url: Mutex<Option<String>>,
    sessions: Mutex<HashMap<String, Session>>,
    access: Mutex<AccessStore>,
    access_path: Mutex<Option<std::path::PathBuf>>,
    config: Mutex<RemoteConfig>,
    config_path: Mutex<Option<std::path::PathBuf>>,
    oauth_states: Mutex<HashMap<String, SystemTime>>,
}

impl RemoteHub {
    pub fn new() -> Self {
        let (tx, _) = tokio::sync::broadcast::channel(1024);
        Self {
            agents: Mutex::new(Vec::new()),
            view: Mutex::new("{}".to_string()),
            buffers: Mutex::new(HashMap::new()),
            tx,
            server: Mutex::new(None),
            handle: Mutex::new(None),
            tunnel_child: Mutex::new(None),
            tunnel_url: Mutex::new(None),
            sessions: Mutex::new(HashMap::new()),
            access: Mutex::new(AccessStore::default()),
            access_path: Mutex::new(None),
            config: Mutex::new(RemoteConfig::default()),
            config_path: Mutex::new(None),
            oauth_states: Mutex::new(HashMap::new()),
        }
    }

    fn issue_oauth_state(&self) -> String {
        let state = uuid::Uuid::new_v4().to_string();
        let mut states = self.oauth_states.lock().unwrap();
        let now = SystemTime::now();
        states.retain(|_, expires| *expires > now);
        states.insert(state.clone(), now + StdDuration::from_secs(600));
        state
    }

    fn consume_oauth_state(&self, state: &str) -> bool {
        let mut states = self.oauth_states.lock().unwrap();
        match states.remove(state) {
            Some(expires) => expires > SystemTime::now(),
            None => false,
        }
    }

    fn web_flow_enabled(&self) -> bool {
        let config = self.config.lock().unwrap();
        !config.client_id.is_empty()
            && !config.client_secret.is_empty()
            && !config.public_hostname.is_empty()
    }

    fn save_config(&self) {
        let path = self.config_path.lock().unwrap().clone();
        if let Some(path) = path {
            let config = self.config.lock().unwrap();
            if let Ok(json) = serde_json::to_string_pretty(&*config) {
                let _ = std::fs::write(path, json);
            }
        }
    }

    fn access_level(&self, login: &str) -> AccessLevel {
        {
            let config = self.config.lock().unwrap();
            if !config.owner.is_empty() && config.owner.eq_ignore_ascii_case(login) {
                return AccessLevel::Owner;
            }
        }
        let access = self.access.lock().unwrap();
        if access.approved.iter().any(|u| u.eq_ignore_ascii_case(login)) {
            AccessLevel::Approved
        } else if access.pending.iter().any(|u| u.eq_ignore_ascii_case(login)) {
            AccessLevel::Pending
        } else {
            AccessLevel::Unknown
        }
    }

    fn save_access(&self) {
        let path = self.access_path.lock().unwrap().clone();
        if let Some(path) = path {
            let store = self.access.lock().unwrap();
            if let Ok(json) = serde_json::to_string_pretty(&*store) {
                let _ = std::fs::write(path, json);
            }
        }
    }

    fn session_user(&self, headers: &HeaderMap) -> Option<String> {
        let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
        let sid = cookie
            .split(';')
            .filter_map(|part| part.trim().strip_prefix("ma_session="))
            .next()?;
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(sid) {
            if session.expires > SystemTime::now() {
                return Some(session.user.clone());
            }
            sessions.remove(sid);
        }
        None
    }

    fn create_session(&self, user: &str) -> String {
        let sid = uuid::Uuid::new_v4().to_string();
        let mut sessions = self.sessions.lock().unwrap();
        let now = SystemTime::now();
        sessions.retain(|_, s| s.expires > now);
        sessions.insert(
            sid.clone(),
            Session {
                user: user.to_string(),
                expires: now + SESSION_TTL,
            },
        );
        sid
    }

    fn authorized(&self, headers: &HeaderMap, query_token: &str) -> bool {
        if self.token_ok(query_token) {
            return true;
        }
        match self.session_user(headers) {
            Some(user) => matches!(
                self.access_level(&user),
                AccessLevel::Owner | AccessLevel::Approved
            ),
            None => false,
        }
    }

    pub fn kill_tunnel(&self) {
        if let Some(mut child) = self.tunnel_child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *self.tunnel_url.lock().unwrap() = None;
    }

    pub fn push(&self, id: &str, bytes: &[u8]) {
        {
            let mut bufs = self.buffers.lock().unwrap();
            let buf = bufs.entry(id.to_string()).or_default();
            buf.extend_from_slice(bytes);
            if buf.len() > MAX_BUFFER {
                let cut = buf.len() - MAX_BUFFER;
                buf.drain(..cut);
            }
        }
        let _ = self.tx.send((id.to_string(), bytes.to_vec()));
    }

    pub fn drop_agent(&self, id: &str) {
        self.buffers.lock().unwrap().remove(id);
    }

    fn token_ok(&self, token: &str) -> bool {
        matches!(
            &*self.server.lock().unwrap(),
            Some(info) if !token.is_empty() && info.token == token
        )
    }
}

#[derive(Serialize)]
pub struct RemoteStatus {
    pub running: bool,
    pub url: Option<String>,
    pub port: Option<u16>,
}

fn local_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|a| a.ip().to_string())
}

fn make_url(port: u16, token: &str) -> String {
    let host = local_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    format!("http://{}:{}/?token={}", host, port, token)
}

pub fn status(hub: &RemoteHub) -> RemoteStatus {
    match &*hub.server.lock().unwrap() {
        Some(info) => RemoteStatus {
            running: true,
            url: Some(make_url(info.port, &info.token)),
            port: Some(info.port),
        },
        None => RemoteStatus {
            running: false,
            url: None,
            port: None,
        },
    }
}

pub async fn start(app: AppHandle) -> Result<RemoteStatus, String> {
    {
        let state = app.state::<AppState>();
        let server = state.remote.server.lock().unwrap();
        if let Some(info) = &*server {
            return Ok(RemoteStatus {
                running: true,
                url: Some(make_url(info.port, &info.token)),
                port: Some(info.port),
            });
        }
    }

    let fixed_port = {
        let state = app.state::<AppState>();
        let config = state.remote.config.lock().unwrap();
        config.server_port
    };
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", fixed_port))
        .await
        .map_err(|e| {
            if fixed_port != 0 {
                format!("bind port {} failed (in use?): {}", fixed_port, e)
            } else {
                format!("bind remote listener: {}", e)
            }
        })?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let token = uuid::Uuid::new_v4().to_string();

    let router = Router::new()
        .route("/", get(page))
        .route("/api/agents", get(agents))
        .route("/api/view", get(view))
        .route("/api/command", post(command))
        .route("/ws", get(ws_upgrade))
        .route("/auth/start", post(auth_start))
        .route("/auth/poll", post(auth_poll))
        .route("/auth/me", get(auth_me))
        .route("/auth/mode", get(auth_mode))
        .route("/auth/login", get(auth_login))
        .route("/auth/callback", get(auth_callback))
        .route("/auth/logout", post(auth_logout))
        .with_state(app.clone());

    let handle = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    let state = app.state::<AppState>();
    *state.remote.server.lock().unwrap() = Some(ServerInfo {
        port,
        token: token.clone(),
    });
    *state.remote.handle.lock().unwrap() = Some(handle);

    Ok(RemoteStatus {
        running: true,
        url: Some(make_url(port, &token)),
        port: Some(port),
    })
}

pub fn stop(app: &AppHandle) -> RemoteStatus {
    let state = app.state::<AppState>();
    state.remote.kill_tunnel();
    if let Some(handle) = state.remote.handle.lock().unwrap().take() {
        handle.abort();
    }
    *state.remote.server.lock().unwrap() = None;
    RemoteStatus {
        running: false,
        url: None,
        port: None,
    }
}

// ---- Cloudflare quick tunnel

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub running: bool,
    pub public_url: Option<String>,
}

const CLOUDFLARED_URL: &str =
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";

fn cloudflared_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("cloudflared.exe"))
}

fn ensure_cloudflared(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let path = cloudflared_path(app)?;
    if path.exists() {
        return Ok(path);
    }
    let response = ureq::get(CLOUDFLARED_URL)
        .set("User-Agent", "MultiAgent")
        .call()
        .map_err(|e| format!("download cloudflared: {}", e))?;
    let mut reader = response.into_reader();
    let tmp = path.with_extension("download");
    let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut file).map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

fn find_tunnel_url(line: &str) -> Option<String> {
    let start = line.find("https://")?;
    let rest = &line[start..];
    let end = rest
        .find(|c: char| c.is_whitespace() || c == '|')
        .unwrap_or(rest.len());
    let url = &rest[..end];
    if url.contains(".trycloudflare.com") {
        Some(url.trim_end_matches('/').to_string())
    } else {
        None
    }
}

fn tunnel_public_url(hub: &RemoteHub) -> Option<String> {
    // No token in the public URL — external visitors authenticate
    // through GitHub Device Flow instead.
    hub.tunnel_url.lock().unwrap().clone()
}

pub fn tunnel_status_of(hub: &RemoteHub) -> TunnelStatus {
    let public_url = tunnel_public_url(hub);
    TunnelStatus {
        running: public_url.is_some(),
        public_url,
    }
}

// ---- Access approval store

pub fn load_access(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(dir) = app.path().app_local_data_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&dir);

    let access_path = dir.join("remote-access.json");
    if let Ok(raw) = std::fs::read_to_string(&access_path) {
        if let Ok(store) = serde_json::from_str::<AccessStore>(&raw) {
            *state.remote.access.lock().unwrap() = store;
        }
    }
    *state.remote.access_path.lock().unwrap() = Some(access_path);

    let config_path = dir.join("remote-config.json");
    if let Ok(raw) = std::fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str::<RemoteConfig>(&raw) {
            *state.remote.config.lock().unwrap() = config;
        }
    }
    *state.remote.config_path.lock().unwrap() = Some(config_path);
}

pub fn config_get(hub: &RemoteHub) -> RemoteConfig {
    hub.config.lock().unwrap().clone()
}

pub fn config_set(hub: &RemoteHub, config: RemoteConfig) -> RemoteConfig {
    {
        let mut current = hub.config.lock().unwrap();
        current.client_id = config.client_id.trim().to_string();
        current.owner = config.owner.trim().to_string();
        current.tunnel_token = config.tunnel_token.trim().to_string();
        current.public_hostname = config
            .public_hostname
            .trim()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_end_matches('/')
            .to_string();
        current.server_port = config.server_port;
        current.client_secret = config.client_secret.trim().to_string();
    }
    hub.save_config();
    config_get(hub)
}

pub fn access_list(hub: &RemoteHub) -> AccessStore {
    hub.access.lock().unwrap().clone()
}

pub fn access_approve(hub: &RemoteHub, login: &str) -> AccessStore {
    {
        let mut access = hub.access.lock().unwrap();
        access.pending.retain(|u| !u.eq_ignore_ascii_case(login));
        if !access.approved.iter().any(|u| u.eq_ignore_ascii_case(login)) {
            access.approved.push(login.to_string());
        }
    }
    hub.save_access();
    access_list(hub)
}

pub fn access_revoke(hub: &RemoteHub, login: &str) -> AccessStore {
    {
        let mut access = hub.access.lock().unwrap();
        access.pending.retain(|u| !u.eq_ignore_ascii_case(login));
        access.approved.retain(|u| !u.eq_ignore_ascii_case(login));
    }
    // Drop live sessions of the revoked user so access ends immediately.
    hub.sessions
        .lock()
        .unwrap()
        .retain(|_, s| !s.user.eq_ignore_ascii_case(login));
    hub.save_access();
    access_list(hub)
}

pub async fn start_tunnel(app: AppHandle) -> Result<TunnelStatus, String> {
    // Make sure the local server is up first (no-op if already running).
    start(app.clone()).await?;

    {
        let state = app.state::<AppState>();
        let status = tunnel_status_of(&state.remote);
        if status.running {
            return Ok(status);
        }
    }

    let (port, config) = {
        let state = app.state::<AppState>();
        let server = state.remote.server.lock().unwrap();
        let port = server.as_ref().map(|s| s.port).ok_or("server not running")?;
        let config = state.remote.config.lock().unwrap().clone();
        (port, config)
    };

    let app_for_task = app.clone();
    let (child, url) = tokio::task::spawn_blocking(
        move || -> Result<(std::process::Child, String), String> {
            let bin = ensure_cloudflared(&app_for_task)?;
            let named = !config.tunnel_token.is_empty();
            let mut cmd = std::process::Command::new(&bin);
            if named {
                cmd.args([
                    "tunnel",
                    "run",
                    "--token",
                    &config.tunnel_token,
                ]);
            } else {
                cmd.args([
                    "tunnel",
                    "--url",
                    &format!("http://127.0.0.1:{}", port),
                    "--no-autoupdate",
                ]);
            }
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            }
            let mut child = cmd
                .spawn()
                .map_err(|e| format!("spawn cloudflared: {}", e))?;

            let stderr = child.stderr.take().ok_or("cloudflared stderr missing")?;
            let stdout = child.stdout.take();
            let (line_tx, line_rx) = std::sync::mpsc::channel::<String>();

            let tx_err = line_tx.clone();
            std::thread::spawn(move || {
                use std::io::BufRead;
                for line in std::io::BufReader::new(stderr).lines().map_while(Result::ok) {
                    let _ = tx_err.send(line);
                }
            });
            if let Some(stdout) = stdout {
                std::thread::spawn(move || {
                    use std::io::BufRead;
                    for line in std::io::BufReader::new(stdout).lines().map_while(Result::ok) {
                        let _ = line_tx.send(line);
                    }
                });
            }

            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(45);
            loop {
                let remaining = deadline.saturating_duration_since(std::time::Instant::now());
                if remaining.is_zero() {
                    let _ = child.kill();
                    return Err(if named {
                        "cloudflared did not connect within 45s (check tunnel token)".to_string()
                    } else {
                        "cloudflared did not report a tunnel URL within 45s".to_string()
                    });
                }
                let line = match line_rx.recv_timeout(remaining) {
                    Ok(line) => line,
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        let _ = child.kill();
                        return Err(
                            "cloudflared exited before the tunnel was ready".to_string()
                        );
                    }
                };
                if named {
                    if line.contains("Registered tunnel connection") {
                        let url = if config.public_hostname.is_empty() {
                            "(Cloudflare 대시보드의 Public hostname으로 접속)".to_string()
                        } else {
                            format!("https://{}", config.public_hostname)
                        };
                        return Ok((child, url));
                    }
                } else if let Some(url) = find_tunnel_url(&line) {
                    return Ok((child, url));
                }
            }
        },
    )
    .await
    .map_err(|e| e.to_string())??;

    let state = app.state::<AppState>();
    *state.remote.tunnel_child.lock().unwrap() = Some(child);
    *state.remote.tunnel_url.lock().unwrap() = Some(url);
    Ok(tunnel_status_of(&state.remote))
}

pub fn stop_tunnel(app: &AppHandle) -> TunnelStatus {
    let state = app.state::<AppState>();
    state.remote.kill_tunnel();
    TunnelStatus {
        running: false,
        public_url: None,
    }
}

fn query_token(q: &HashMap<String, String>) -> &str {
    q.get("token").map(String::as_str).unwrap_or("")
}

async fn page(
    State(app): State<AppHandle>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let authorized = app
        .state::<AppState>()
        .remote
        .authorized(&headers, query_token(&q));
    if !authorized {
        return Html(LOGIN_PAGE).into_response();
    }
    Html(PAGE).into_response()
}

async fn agents(
    State(app): State<AppHandle>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let state = app.state::<AppState>();
    if !state.remote.authorized(&headers, query_token(&q)) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let list = state.remote.agents.lock().unwrap().clone();
    Json(serde_json::json!({ "agents": list })).into_response()
}

async fn view(
    State(app): State<AppHandle>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let state = app.state::<AppState>();
    if !state.remote.authorized(&headers, query_token(&q)) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let json = state.remote.view.lock().unwrap().clone();
    (
        [(header::CONTENT_TYPE, "application/json")],
        json,
    )
        .into_response()
}

async fn command(
    State(app): State<AppHandle>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let state = app.state::<AppState>();
    // Commands carry no query string, so authenticate by session cookie only.
    if state.remote.session_user(&headers).is_none()
        && !state.remote.authorized(&headers, "")
    {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    let cmd = body.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let id = body.get("id").and_then(|i| i.as_str()).unwrap_or("");
    if cmd.is_empty() || id.is_empty() {
        return (StatusCode::BAD_REQUEST, "type and id required").into_response();
    }
    let _ = app.emit(
        "remote:command",
        serde_json::json!({ "type": cmd, "id": id }),
    );
    Json(serde_json::json!({ "ok": true })).into_response()
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(app): State<AppHandle>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let id = q.get("id").cloned().unwrap_or_default();
    let authorized = app
        .state::<AppState>()
        .remote
        .authorized(&headers, query_token(&q));
    if !authorized || id.is_empty() {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, app, id))
}

// ---- GitHub Device Flow auth

fn github_json(result: Result<ureq::Response, ureq::Error>) -> Result<serde_json::Value, String> {
    let response = match result {
        Ok(r) => r,
        Err(ureq::Error::Status(_, r)) => r,
        Err(e) => return Err(e.to_string()),
    };
    response
        .into_json::<serde_json::Value>()
        .map_err(|e| e.to_string())
}

async fn auth_start(State(app): State<AppHandle>) -> Response {
    let client_id = config_get(&app.state::<AppState>().remote).client_id;
    if client_id.is_empty() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "error": "GitHub Client ID is not configured on the server (Settings > Remote access)"
            })),
        )
            .into_response();
    }
    let result = tokio::task::spawn_blocking(move || {
        github_json(
            ureq::post("https://github.com/login/device/code")
                .set("Accept", "application/json")
                .set("User-Agent", "MultiAgent")
                .send_form(&[("client_id", &client_id), ("scope", "read:user")]),
        )
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);

    match result {
        Ok(json) => Json(json).into_response(),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn auth_poll(
    State(app): State<AppHandle>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let Some(device_code) = body.get("device_code").and_then(|d| d.as_str()) else {
        return (StatusCode::BAD_REQUEST, "device_code required").into_response();
    };
    let device_code = device_code.to_string();
    let client_id = config_get(&app.state::<AppState>().remote).client_id;

    let token_result = tokio::task::spawn_blocking(move || {
        github_json(
            ureq::post("https://github.com/login/oauth/access_token")
                .set("Accept", "application/json")
                .set("User-Agent", "MultiAgent")
                .send_form(&[
                    ("client_id", &client_id),
                    ("device_code", &device_code),
                    (
                        "grant_type",
                        "urn:ietf:params:oauth:grant-type:device_code",
                    ),
                ]),
        )
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);

    let token_json = match token_result {
        Ok(j) => j,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response()
        }
    };

    if let Some(err) = token_json.get("error").and_then(|e| e.as_str()) {
        if err == "authorization_pending" || err == "slow_down" {
            return Json(serde_json::json!({ "pending": true })).into_response();
        }
        return Json(serde_json::json!({ "error": err })).into_response();
    }

    let Some(access_token) = token_json.get("access_token").and_then(|t| t.as_str()) else {
        return Json(serde_json::json!({ "error": "no access token" })).into_response();
    };
    let access_token = access_token.to_string();

    let user_result = tokio::task::spawn_blocking(move || {
        github_json(
            ureq::get("https://api.github.com/user")
                .set("Accept", "application/json")
                .set("User-Agent", "MultiAgent")
                .set("Authorization", &format!("Bearer {}", access_token))
                .call(),
        )
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);

    let login = match user_result {
        Ok(j) => j
            .get("login")
            .and_then(|l| l.as_str())
            .unwrap_or_default()
            .to_string(),
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response()
        }
    };

    if login.is_empty() {
        return Json(serde_json::json!({ "error": "github login missing" })).into_response();
    }

    let (cookie, approved) = register_login(&app, &login);
    let body = if approved {
        serde_json::json!({ "ok": true, "user": login })
    } else {
        serde_json::json!({ "ok": false, "pending_approval": true, "user": login })
    };
    ([(header::SET_COOKIE, cookie)], Json(body)).into_response()
}

/// Register a verified GitHub login: unknown users land in the pending
/// queue, and a session cookie identifying the user is always issued.
/// Whether the session grants terminal access is decided live by the
/// approval list.
fn register_login(app: &AppHandle, login: &str) -> (String, bool) {
    let hub = app.state::<AppState>().remote.clone();
    let level = hub.access_level(login);
    if level == AccessLevel::Unknown {
        {
            let mut access = hub.access.lock().unwrap();
            access.pending.push(login.to_string());
        }
        hub.save_access();
        let _ = app.emit(
            "remote:access-request",
            serde_json::json!({ "login": login }),
        );
    }
    let sid = hub.create_session(login);
    let cookie = format!(
        "ma_session={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
        sid,
        SESSION_TTL.as_secs()
    );
    let approved = matches!(level, AccessLevel::Owner | AccessLevel::Approved);
    (cookie, approved)
}

fn url_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 3);
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

async fn auth_mode(State(app): State<AppHandle>) -> Response {
    let web = app.state::<AppState>().remote.web_flow_enabled();
    Json(serde_json::json!({ "web": web })).into_response()
}

async fn auth_login(State(app): State<AppHandle>) -> Response {
    let hub = app.state::<AppState>().remote.clone();
    if !hub.web_flow_enabled() {
        return (StatusCode::NOT_FOUND, "web flow not configured").into_response();
    }
    let config = hub.config.lock().unwrap().clone();
    let state = hub.issue_oauth_state();
    let redirect_uri = format!("https://{}/auth/callback", config.public_hostname);
    let url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&state={}&scope=read%3Auser",
        url_encode(&config.client_id),
        url_encode(&redirect_uri),
        state
    );
    axum::response::Redirect::temporary(&url).into_response()
}

async fn auth_callback(
    State(app): State<AppHandle>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let hub = app.state::<AppState>().remote.clone();
    let code = q.get("code").cloned().unwrap_or_default();
    let state = q.get("state").cloned().unwrap_or_default();
    if code.is_empty() || !hub.consume_oauth_state(&state) {
        return (StatusCode::BAD_REQUEST, "invalid oauth state — try logging in again")
            .into_response();
    }

    let config = hub.config.lock().unwrap().clone();
    let redirect_uri = format!("https://{}/auth/callback", config.public_hostname);
    let token_result = tokio::task::spawn_blocking(move || {
        github_json(
            ureq::post("https://github.com/login/oauth/access_token")
                .set("Accept", "application/json")
                .set("User-Agent", "MultiAgent")
                .send_form(&[
                    ("client_id", config.client_id.as_str()),
                    ("client_secret", config.client_secret.as_str()),
                    ("code", code.as_str()),
                    ("redirect_uri", redirect_uri.as_str()),
                ]),
        )
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);

    let token_json = match token_result {
        Ok(j) => j,
        Err(e) => return (StatusCode::BAD_GATEWAY, format!("token exchange: {}", e)).into_response(),
    };
    let Some(access_token) = token_json.get("access_token").and_then(|t| t.as_str()) else {
        let err = token_json
            .get("error_description")
            .or_else(|| token_json.get("error"))
            .and_then(|e| e.as_str())
            .unwrap_or("no access token");
        return (StatusCode::BAD_GATEWAY, format!("github: {}", err)).into_response();
    };
    let access_token = access_token.to_string();

    let user_result = tokio::task::spawn_blocking(move || {
        github_json(
            ureq::get("https://api.github.com/user")
                .set("Accept", "application/json")
                .set("User-Agent", "MultiAgent")
                .set("Authorization", &format!("Bearer {}", access_token))
                .call(),
        )
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);

    let login = match user_result {
        Ok(j) => j
            .get("login")
            .and_then(|l| l.as_str())
            .unwrap_or_default()
            .to_string(),
        Err(e) => return (StatusCode::BAD_GATEWAY, format!("github user: {}", e)).into_response(),
    };
    if login.is_empty() {
        return (StatusCode::BAD_GATEWAY, "github login missing").into_response();
    }

    let (cookie, _approved) = register_login(&app, &login);
    (
        [(header::SET_COOKIE, cookie)],
        axum::response::Redirect::to("/"),
    )
        .into_response()
}

async fn auth_me(State(app): State<AppHandle>, headers: HeaderMap) -> Response {
    let hub = app.state::<AppState>().remote.clone();
    match hub.session_user(&headers) {
        Some(user) => {
            let approved = matches!(
                hub.access_level(&user),
                AccessLevel::Owner | AccessLevel::Approved
            );
            Json(serde_json::json!({ "user": user, "approved": approved })).into_response()
        }
        None => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "user": null })),
        )
            .into_response(),
    }
}

async fn auth_logout(State(app): State<AppHandle>, headers: HeaderMap) -> Response {
    let hub = app.state::<AppState>().remote.clone();
    if let Some(cookie) = headers.get(header::COOKIE).and_then(|c| c.to_str().ok()) {
        if let Some(sid) = cookie
            .split(';')
            .filter_map(|part| part.trim().strip_prefix("ma_session="))
            .next()
        {
            hub.sessions.lock().unwrap().remove(sid);
        }
    }
    (
        [(header::SET_COOKIE, "ma_session=; Path=/; Max-Age=0".to_string())],
        Json(serde_json::json!({ "ok": true })),
    )
        .into_response()
}

async fn handle_socket(mut socket: WebSocket, app: AppHandle, id: String) {
    let hub = app.state::<AppState>().remote.clone();

    let backlog = hub.buffers.lock().unwrap().get(&id).cloned();
    if let Some(bytes) = backlog {
        if !bytes.is_empty() && socket.send(Message::Binary(bytes.into())).await.is_err() {
            return;
        }
    }

    let mut rx = hub.tx.subscribe();
    loop {
        tokio::select! {
            chunk = rx.recv() => match chunk {
                Ok((cid, bytes)) => {
                    if cid == id
                        && socket.send(Message::Binary(bytes.into())).await.is_err()
                    {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            },
            msg = socket.recv() => match msg {
                Some(Ok(Message::Text(text))) => {
                    handle_client_msg(&app, &id, text.as_str(), &mut socket).await;
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(_)) => break,
            },
        }
    }
}

async fn handle_client_msg(app: &AppHandle, id: &str, raw: &str, socket: &mut WebSocket) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return;
    };
    let msg_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");

    if msg_type == "resize" {
        let cols = value.get("cols").and_then(|c| c.as_u64()).unwrap_or(0) as u16;
        let rows = value.get("rows").and_then(|r| r.as_u64()).unwrap_or(0) as u16;
        if cols >= 2 && rows >= 2 {
            let state = app.state::<AppState>();
            let ptys = state.ptys.lock().unwrap();
            if let Some(pty) = ptys.get(id) {
                let _ = pty.master.resize(portable_pty::PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                });
            }
        }
        return;
    }

    if msg_type != "input" {
        return;
    }
    let Some(data) = value.get("data").and_then(|d| d.as_str()) else {
        return;
    };

    let writer = {
        let state = app.state::<AppState>();
        let ptys = state.ptys.lock().unwrap();
        ptys.get(id).map(|p| p.writer.clone())
    };

    match writer {
        Some(writer) => {
            let data = data.to_string();
            let _ = tokio::task::spawn_blocking(move || {
                if let Ok(mut guard) = writer.lock() {
                    let _ = guard.write_all(data.as_bytes());
                    let _ = guard.flush();
                }
            })
            .await;
        }
        None => {
            let _ = socket
                .send(Message::Text(
                    "{\"type\":\"error\",\"message\":\"session is not running — start it in the app first\"}"
                        .to_string()
                        .into(),
                ))
                .await;
        }
    }
}
