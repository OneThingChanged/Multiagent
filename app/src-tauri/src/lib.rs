use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use fs2::FileExt;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use toml_edit::{value, ArrayOfTables, DocumentMut, Item, Table};

mod monitor;
#[cfg(not(multiagent_company))]
mod remote;
mod usage;

struct PtyHandle {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    _session_lock: SessionLock,
    /// Reverse-tunnel remote port allocated for this SSH session (freed on exit).
    remote_port: Option<u16>,
}

struct SessionLock {
    path: PathBuf,
    file: File,
}

impl Drop for SessionLock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
        let _ = fs::remove_file(&self.path);
    }
}

struct HookInfo {
    port: u16,
    token: String,
    helper_path: String,
}

struct AppState {
    ptys: Mutex<HashMap<String, PtyHandle>>,
    hook_info: HookInfo,
    close_confirmed: Mutex<bool>,
    secondary_window: bool,
    /// Reverse-tunnel remote ports in use (per app instance), for unique
    /// per-session allocation so concurrent SSH sessions don't collide.
    remote_ports: Mutex<HashSet<u16>>,
    /// Serializes remote-hook setup (read/merge/write of remote settings) so
    /// concurrent spawns don't clobber each other's lost-update.
    remote_setup_lock: Mutex<()>,
    /// SSH host passwords (host id → password) for password-auth hosts. Kept
    /// out of localStorage; persisted to ssh-secrets.json in app_local_data_dir.
    ssh_secrets: Mutex<HashMap<String, String>>,
    #[cfg(not(multiagent_company))]
    remote: Arc<remote::RemoteHub>,
    monitor: Arc<monitor::MonitorHub>,
    usage: Arc<usage::UsageHub>,
    desktop_pet: Mutex<DesktopPetUpdate>,
}

/// Allocate an unused reverse-tunnel remote port (49152+) and record it.
fn alloc_remote_port(used: &Mutex<HashSet<u16>>) -> u16 {
    let mut set = used.lock().unwrap();
    let mut port: u16 = 49152;
    while set.contains(&port) {
        port = port.checked_add(1).unwrap_or(49152);
    }
    set.insert(port);
    port
}

fn free_remote_port(used: &Mutex<HashSet<u16>>, port: u16) {
    used.lock().unwrap().remove(&port);
}

#[derive(Clone, Serialize)]
struct PtyData {
    id: String,
    data: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopPetUpdate {
    status: String,
    working_count: usize,
    completed_count: usize,
    title: Option<String>,
    body: Option<String>,
    agent_id: Option<String>,
    notification_key: Option<String>,
}

/// SSH connection parameters for spawning a remote session. Field names match
/// the camelCase keys sent from the frontend.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SshSpawn {
    host: String,
    user: String,
    port: Option<u16>,
    identity_file: Option<String>,
    extra_options: Option<String>,
    remote_folder: Option<String>,
    /// "windows" or "posix" (default). Decides remote command syntax.
    remote_os: Option<String>,
    /// "key" (default) or "password". Decides auth options + password auto-fill.
    auth_method: Option<String>,
    /// SSH host id, used to look up a stored password for password auth.
    host_id: Option<String>,
}

/// Build the single remote command string passed to `ssh`. Combines an optional
/// `cd` into the remote working directory with the tool/shell to run, so the
/// session lands in the right place without relying on a typed init command.
/// Returns an empty string when no command is needed (drop into the remote's
/// default interactive shell).
fn build_ssh_remote_command(
    remote_folder: Option<&str>,
    init_command: Option<&str>,
    remote_os: Option<&str>,
    env: &[(&'static str, String)],
) -> String {
    let folder = remote_folder.map(str::trim).filter(|f| !f.is_empty());
    let tool = init_command.map(str::trim).filter(|c| !c.is_empty());

    if remote_os == Some("windows") {
        // The remote's SSH default shell may be cmd.exe OR PowerShell (and old
        // PowerShell 5.1 doesn't even support `&&`). To work regardless, emit a
        // `powershell -EncodedCommand <base64>` invocation: both cmd and
        // PowerShell can run it, and base64 removes all quoting/`&&`/`/d` issues.
        let mut script = String::new();
        // Some Windows SSH sessions do not propagate TERM. TUI frameworks use it
        // for key decoding, so force an xterm-compatible terminal for child CLIs.
        script.push_str("$env:TERM='xterm-256color';$env:COLORTERM='truecolor';");
        // Env injection for remote hooks (inherited by the launched tool).
        for (k, v) in env {
            script.push_str(&format!("$env:{}={};", k, ps_single_quote(v)));
        }
        if let Some(f) = folder {
            script.push_str(&format!(
                "Set-Location -LiteralPath {};",
                ps_single_quote(f)
            ));
        }
        if let Some(t) = tool {
            script.push_str(t);
        }
        if script.is_empty() {
            // Nothing to run → drop into the remote's default shell.
            return String::new();
        }
        // -NoExit keeps an interactive PowerShell after the tool/cd (parity with
        // local: returning to a prompt when the tool exits).
        return format!(
            "powershell -NoProfile -NoExit -EncodedCommand {}",
            ps_encoded(&script)
        );
    }

    // POSIX (Linux/macOS) shells.
    let env_part = "export TERM='xterm-256color' COLORTERM='truecolor'; ";
    let exec_part = match tool {
        Some(t) => format!("exec {}", t),
        None => "exec \"$SHELL\" -l".to_string(),
    };
    match folder {
        // Single-quote the folder for POSIX shells; escape embedded quotes.
        Some(f) => format!(
            "{}cd '{}' && {}",
            env_part,
            f.replace('\'', "'\\''"),
            exec_part
        ),
        None => format!("{}{}", env_part, exec_part),
    }
}

#[derive(Clone, Serialize)]
struct PtyExit {
    id: String,
}

#[derive(Clone, Serialize)]
struct HookEvent {
    id: String,
    event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transcript_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cwd: Option<String>,
}

#[derive(Clone, Serialize)]
struct MarkdownFile {
    name: String,
    relative_path: String,
}

#[derive(Clone, Serialize)]
struct TerminalPathResolution {
    kind: String,
    path: String,
}

#[derive(Clone, Serialize)]
struct RuntimeFlags {
    secondary_window: bool,
    open_agent_id: Option<String>,
}

const HOOK_MARKER: &str = "multiagent";
const MAX_MARKDOWN_FILES: usize = 500;
const MAX_MARKDOWN_FILE_BYTES: u64 = 2 * 1024 * 1024;

fn is_secondary_window_process() -> bool {
    std::env::var("MULTIAGENT_SECONDARY_WINDOW").ok().as_deref() == Some("1")
        || std::env::args().any(|arg| arg == "--multiagent-secondary-window")
}

fn open_agent_id_arg() -> Option<String> {
    if let Ok(value) = std::env::var("MULTIAGENT_OPEN_AGENT_ID") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == "--multiagent-open-agent" {
            return args
                .next()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
        }
    }
    None
}

#[cfg(windows)]
fn default_shell() -> String {
    // Order:
    // 1. Microsoft Store PowerShell (7.6+) via WindowsApps app execution alias
    // 2. MSI install of PowerShell 7
    // 3. Windows PowerShell 5.1
    // 4. cmd.exe
    let candidates = [
        std::env::var("LOCALAPPDATA").ok().map(|l| {
            PathBuf::from(l)
                .join("Microsoft")
                .join("WindowsApps")
                .join("pwsh.exe")
        }),
        std::env::var("ProgramFiles").ok().map(|p| {
            PathBuf::from(p)
                .join("PowerShell")
                .join("7")
                .join("pwsh.exe")
        }),
        Some(PathBuf::from(r"C:\Program Files\PowerShell\7\pwsh.exe")),
        std::env::var("SystemRoot").ok().map(|r| {
            PathBuf::from(r)
                .join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        }),
        Some(PathBuf::from(
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
        )),
    ];
    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return candidate.to_string_lossy().into_owned();
        }
    }
    std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
}

#[cfg(not(windows))]
fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

fn write_helper_script(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("notify.ps1");
    let script = r#"param([string]$Event)
$base = Join-Path $env:LOCALAPPDATA "com.jintae.multiagent"
$logPath = Join-Path $base "hook.log"
$infoPath = Join-Path $base "hook-info.json"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
$sessionId = $null
$transcriptPath = $null
$cwd = $null
try {
  $stdinText = [Console]::In.ReadToEnd()
  if ($stdinText) {
    $payload = $stdinText | ConvertFrom-Json
    if ($payload.session_id) { $sessionId = [string]$payload.session_id }
    if ($payload.transcript_path) { $transcriptPath = [string]$payload.transcript_path }
    if ($payload.cwd) { $cwd = [string]$payload.cwd }
  }
} catch {}
# Prefer the per-session env vars (set by the app that spawned this
# session). The session always belongs to a live app, so its port/token
# are accurate even if another app instance later rewrote hook-info.json.
$port = $env:MULTIAGENT_PORT
$token = $env:MULTIAGENT_TOKEN
if (-not $port -or -not $token) {
  if (Test-Path $infoPath) {
    try {
      $info = Get-Content $infoPath -Raw | ConvertFrom-Json
      if (-not $port -and $info.port) { $port = [string]$info.port }
      if (-not $token -and $info.token) { $token = [string]$info.token }
    } catch {}
  }
}
"$ts | event=$Event | agent=$($env:MULTIAGENT_AGENT_ID) | session=$sessionId | transcript=$transcriptPath | port=$port" | Out-File -FilePath $logPath -Append -Encoding utf8
if (-not $port -or -not $token) { "$ts |   ! no port/token" | Out-File -FilePath $logPath -Append -Encoding utf8; exit 0 }
try {
  $bodyMap = @{ id = $env:MULTIAGENT_AGENT_ID; event = $Event; token = $token }
  if ($sessionId) { $bodyMap.session_id = $sessionId }
  if ($transcriptPath) { $bodyMap.transcript_path = $transcriptPath }
  if ($cwd) { $bodyMap.cwd = $cwd }
  $body = $bodyMap | ConvertTo-Json -Compress
  Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:$port/event" -Body $body -ContentType 'application/json' -TimeoutSec 2 -UseBasicParsing | Out-Null
  "$ts |   posted ok port=$port" | Out-File -FilePath $logPath -Append -Encoding utf8
} catch {
  "$ts |   error: $_" | Out-File -FilePath $logPath -Append -Encoding utf8
}
"#;
    fs::write(&path, script).map_err(|e| e.to_string())?;
    Ok(path)
}

/// The remote hook helper (PowerShell), pushed to Windows remotes over SSH.
/// Same as the local notify.ps1 but env-only: the port/token/agent-id are
/// injected into the remote shell at spawn (no hook-info.json on the remote).
/// Posts to 127.0.0.1:$port which the reverse SSH tunnel forwards to the local
/// hook server.
fn remote_helper_script() -> &'static str {
    r#"param([string]$Event)
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
$logPath = Join-Path $env:TEMP "multiagent-remote-hook.log"
$sessionId = $null
$transcriptPath = $null
$cwd = $null
try {
  $stdinText = [Console]::In.ReadToEnd()
  if ($stdinText) {
    $payload = $stdinText | ConvertFrom-Json
    if ($payload.session_id) { $sessionId = [string]$payload.session_id }
    if ($payload.transcript_path) { $transcriptPath = [string]$payload.transcript_path }
    if ($payload.cwd) { $cwd = [string]$payload.cwd }
  }
} catch {}
$port = $env:MULTIAGENT_PORT
$token = $env:MULTIAGENT_TOKEN
"$ts | event=$Event | agent=$($env:MULTIAGENT_AGENT_ID) | session=$sessionId | port=$port" | Out-File -FilePath $logPath -Append -Encoding utf8
if (-not $port -or -not $token) { "$ts |   ! no port/token (env)" | Out-File -FilePath $logPath -Append -Encoding utf8; exit 0 }
try {
  $bodyMap = @{ id = $env:MULTIAGENT_AGENT_ID; event = $Event; token = $token }
  if ($sessionId) { $bodyMap.session_id = $sessionId }
  if ($transcriptPath) { $bodyMap.transcript_path = $transcriptPath }
  if ($cwd) { $bodyMap.cwd = $cwd }
  $body = $bodyMap | ConvertTo-Json -Compress
  Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:$port/event" -Body $body -ContentType 'application/json' -TimeoutSec 2 -UseBasicParsing | Out-Null
  "$ts |   posted ok port=$port" | Out-File -FilePath $logPath -Append -Encoding utf8
} catch {
  "$ts |   error: $_" | Out-File -FilePath $logPath -Append -Encoding utf8
}
"#
}

fn write_hook_info(app: &AppHandle, port: u16, token: &str) -> Result<(), String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("hook-info.json");
    let body = serde_json::json!({ "port": port, "token": token }).to_string();
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(())
}

fn session_lock_file_name(id: &str) -> String {
    let mut safe = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    if safe.is_empty() {
        safe = "session".to_string();
    }
    format!("{}.lock", safe)
}

fn acquire_session_lock(app: &AppHandle, id: &str) -> Result<SessionLock, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("session-locks");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(session_lock_file_name(id));
    let mut file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|e| e.to_string())?;

    file.try_lock_exclusive()
        .map_err(|_| "이 세션은 다른 MultiAgent 창에서 이미 실행 중입니다.".to_string())?;
    file.set_len(0).map_err(|e| e.to_string())?;
    writeln!(file, "pid={}", std::process::id()).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;

    Ok(SessionLock { path, file })
}

fn start_hook_server(app: AppHandle, token: String) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let server = tiny_http::Server::from_listener(listener, None).map_err(|e| e.to_string())?;

    thread::spawn(move || {
        for mut req in server.incoming_requests() {
            if req.method() != &tiny_http::Method::Post || req.url() != "/event" {
                let _ = req.respond(tiny_http::Response::empty(404));
                continue;
            }
            let mut body = String::new();
            if req.as_reader().read_to_string(&mut body).is_err() {
                let _ = req.respond(tiny_http::Response::empty(400));
                continue;
            }
            let parsed: serde_json::Value = match serde_json::from_str(&body) {
                Ok(v) => v,
                Err(_) => {
                    let _ = req.respond(tiny_http::Response::empty(400));
                    continue;
                }
            };
            if parsed.get("token").and_then(|t| t.as_str()) != Some(&token) {
                let _ = req.respond(tiny_http::Response::empty(401));
                continue;
            }
            let id = parsed
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let event = parsed
                .get("event")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let session_id = parsed
                .get("session_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let transcript_path = parsed
                .get("transcript_path")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let cwd = parsed
                .get("cwd")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if !id.is_empty() && !event.is_empty() {
                let state: State<AppState> = app.state();
                if event == "session-start" {
                    if let Some(session_id) = session_id.as_deref() {
                        state.usage.note_session(&id, session_id);
                    }
                } else if event == "done" {
                    state
                        .usage
                        .ingest_agent(id.clone(), transcript_path.clone());
                }
                state.monitor.note_hook(
                    id.clone(),
                    event.clone(),
                    session_id.clone(),
                    transcript_path.clone(),
                    cwd.clone(),
                );
                let _ = app.emit(
                    "agent:hook-event",
                    HookEvent {
                        id,
                        event,
                        session_id,
                        transcript_path,
                        cwd,
                    },
                );
            }
            let _ = req.respond(tiny_http::Response::empty(200));
        }
    });

    Ok(port)
}

/// The PowerShell command claude/codex run for each hook event. Identical shape
/// for local and remote; only `helper_path` differs (local app-data path vs a
/// remote absolute path).
fn hook_command(helper_path: &str, arg: &str) -> String {
    format!(
        r#"powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{}" {}"#,
        helper_path, arg
    )
}

const HOOK_EVENTS: [(&str, &str); 3] = [
    ("UserPromptSubmit", "working"),
    ("Stop", "done"),
    ("SessionStart", "session-start"),
];

/// Merge our hooks into an existing claude `settings.local.json` body (empty
/// string = no file). Pure string→string so it can be reused over SSH. Existing
/// user hooks are preserved; only our `__source` entries are replaced.
fn merge_claude_settings(existing: &str, helper_path: &str) -> Result<String, String> {
    let mut settings: serde_json::Value = if existing.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(existing).unwrap_or_else(|_| serde_json::json!({}))
    };
    if !settings.is_object() {
        settings = serde_json::json!({});
    }

    let our_hook = |cmd: String| {
        serde_json::json!({
            "matcher": ".*",
            "__source": HOOK_MARKER,
            "hooks": [{ "type": "command", "command": cmd }]
        })
    };

    let obj = settings.as_object_mut().unwrap();
    let hooks_entry = obj
        .entry("hooks".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if !hooks_entry.is_object() {
        *hooks_entry = serde_json::json!({});
    }
    let hooks_obj = hooks_entry.as_object_mut().unwrap();

    for (event_name, arg) in HOOK_EVENTS {
        let entry = hooks_obj
            .entry(event_name.to_string())
            .or_insert_with(|| serde_json::json!([]));
        if !entry.is_array() {
            *entry = serde_json::json!([]);
        }
        let arr = entry.as_array_mut().unwrap();
        arr.retain(|h| h.get("__source").and_then(|s| s.as_str()) != Some(HOOK_MARKER));
        arr.push(our_hook(hook_command(helper_path, arg)));
    }

    serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())
}

/// Merge our hooks into an existing codex `config.toml` body (empty string = no
/// file). Pure string→string so it can be reused over SSH.
fn merge_codex_config(existing: &str, helper_path: &str) -> Result<String, String> {
    let mut doc: DocumentMut = if existing.trim().is_empty() {
        DocumentMut::new()
    } else {
        existing.parse::<DocumentMut>().map_err(|e| e.to_string())?
    };

    if doc.get("hooks").map(|h| !h.is_table()).unwrap_or(true) {
        doc["hooks"] = Item::Table(Table::new());
    }
    let hooks_table = doc["hooks"].as_table_mut().unwrap();

    for (event_name, arg) in HOOK_EVENTS {
        if hooks_table
            .get(event_name)
            .map(|i| !matches!(i, Item::ArrayOfTables(_)))
            .unwrap_or(true)
        {
            hooks_table.insert(event_name, Item::ArrayOfTables(ArrayOfTables::new()));
        }
        let aot = hooks_table[event_name].as_array_of_tables_mut().unwrap();

        aot.retain(|t| t.get("__source").and_then(|v| v.as_str()) != Some(HOOK_MARKER));

        let mut entry = Table::new();
        entry.insert("matcher", value(""));
        entry.insert("__source", value(HOOK_MARKER));

        let mut inner_aot = ArrayOfTables::new();
        let mut inner = Table::new();
        inner.insert("type", value("command"));
        inner.insert("command", value(hook_command(helper_path, arg)));
        inner_aot.push(inner);
        entry.insert("hooks", Item::ArrayOfTables(inner_aot));

        aot.push(entry);
    }

    Ok(doc.to_string())
}

pub(crate) fn setup_claude_hooks(folder: &str, helper_path: &str) -> Result<(), String> {
    let claude_dir = Path::new(folder).join(".claude");
    fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.local.json");
    let existing = fs::read_to_string(&settings_path).unwrap_or_default();
    let merged = merge_claude_settings(&existing, helper_path)?;
    fs::write(&settings_path, merged).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn setup_codex_hooks(folder: &str, helper_path: &str) -> Result<(), String> {
    let codex_dir = Path::new(folder).join(".codex");
    fs::create_dir_all(&codex_dir).map_err(|e| e.to_string())?;
    let config_path = codex_dir.join("config.toml");
    let existing = fs::read_to_string(&config_path).unwrap_or_default();
    let merged = merge_codex_config(&existing, helper_path)?;
    fs::write(&config_path, merged).map_err(|e| e.to_string())?;
    Ok(())
}

fn normalize_relative_path(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            matches!(
                e.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "html" | "htm"
            )
        })
        .unwrap_or(false)
}

fn image_mime_type(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        Some("bmp") => Some("image/bmp"),
        Some("svg") => Some("image/svg+xml"),
        Some("ico") => Some("image/x-icon"),
        _ => None,
    }
}

fn is_image_file(path: &Path) -> bool {
    image_mime_type(path).is_some()
}

fn is_safe_relative_file_path(path: &Path) -> bool {
    !path.is_absolute()
        && path.components().all(|component| {
            matches!(
                component,
                std::path::Component::Normal(_) | std::path::Component::CurDir
            )
        })
}

fn relative_path_starts_with(path: &Path, segment: &str) -> bool {
    path.components()
        .find_map(|component| match component {
            std::path::Component::Normal(value) => value.to_str(),
            std::path::Component::CurDir => None,
            _ => None,
        })
        .map(|value| value.eq_ignore_ascii_case(segment))
        .unwrap_or(false)
}

fn push_image_probe(probes: &mut Vec<PathBuf>, path: PathBuf) {
    if !probes.iter().any(|existing| existing == &path) {
        probes.push(path);
    }
}

fn add_relative_image_probes(probes: &mut Vec<PathBuf>, root: &Path, relative: &Path) {
    push_image_probe(probes, root.join(relative));
    if !relative_path_starts_with(relative, "Docs") {
        push_image_probe(probes, root.join("Docs").join(relative));
    }
}

fn sibling_image_dir_rank(path: &Path, root_name: &str) -> u8 {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return 3;
    };
    let name = name.to_ascii_lowercase();
    let root_name = root_name.to_ascii_lowercase();
    if name == root_name {
        0
    } else if !root_name.is_empty() && name.starts_with(&root_name) {
        1
    } else {
        2
    }
}

fn resolve_image_file(path: &str, folder: Option<&str>) -> Result<PathBuf, String> {
    let raw = path
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`' | '<' | '>' | '(' | ')' | '[' | ']'));
    if raw.is_empty() {
        return Err("image path is empty".to_string());
    }

    let candidate = PathBuf::from(raw);
    if candidate.is_absolute() {
        let canonical = candidate
            .canonicalize()
            .map_err(|e| format!("image not found: {}", e))?;
        if !is_image_file(&canonical) {
            return Err("not a supported image type".to_string());
        }
        return Ok(canonical);
    }

    if !is_safe_relative_file_path(&candidate) {
        return Err("invalid image path".to_string());
    }

    let mut probes = Vec::new();
    if let Some(folder) = folder.filter(|value| !value.trim().is_empty()) {
        let root = PathBuf::from(folder.trim())
            .canonicalize()
            .map_err(|e| format!("folder not found: {}", e))?;
        add_relative_image_probes(&mut probes, &root, &candidate);

        if let Some(parent) = root.parent() {
            push_image_probe(&mut probes, parent.join(&candidate));

            let root_name = root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_string();
            let mut sibling_dirs = fs::read_dir(parent)
                .map_err(|e| e.to_string())?
                .filter_map(|entry| {
                    let entry = entry.ok()?;
                    if entry.file_type().ok()?.is_dir() {
                        Some(entry.path())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();
            sibling_dirs.sort_by(|left, right| {
                sibling_image_dir_rank(left, &root_name)
                    .cmp(&sibling_image_dir_rank(right, &root_name))
                    .then_with(|| left.cmp(right))
            });

            for dir in sibling_dirs {
                if dir == root {
                    continue;
                }
                add_relative_image_probes(&mut probes, &dir, &candidate);
            }
        }
    }
    push_image_probe(&mut probes, candidate);

    for probe in probes {
        if let Ok(canonical) = probe.canonicalize() {
            if canonical.is_file() && is_image_file(&canonical) {
                return Ok(canonical);
            }
        }
    }

    Err("image not found".to_string())
}

fn push_folder_probe(probes: &mut Vec<PathBuf>, path: PathBuf) {
    if !probes.iter().any(|existing| existing == &path) {
        probes.push(path);
    }
}

fn add_relative_folder_probes(probes: &mut Vec<PathBuf>, root: &Path, relative: &Path) {
    push_folder_probe(probes, root.join(relative));
    if !relative_path_starts_with(relative, "Docs") {
        push_folder_probe(probes, root.join("Docs").join(relative));
    }
}

fn path_without_first_component(path: &Path, first: &str) -> Option<PathBuf> {
    let mut parts = Vec::new();
    let mut saw_first = false;
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::Normal(value) => {
                if !saw_first {
                    if value
                        .to_str()
                        .map(|text| text.eq_ignore_ascii_case(first))
                        .unwrap_or(false)
                    {
                        saw_first = true;
                    } else {
                        return None;
                    }
                } else {
                    parts.push(value.to_os_string());
                }
            }
            _ => return None,
        }
    }
    if !saw_first || parts.is_empty() {
        return None;
    }
    Some(parts.into_iter().collect())
}

fn add_unreal_folder_probes(probes: &mut Vec<PathBuf>, root: &Path, relative: &Path) {
    if let Some(game_path) = path_without_first_component(relative, "Game") {
        push_folder_probe(
            probes,
            root.join("UnrealTF").join("Content").join(&game_path),
        );
        push_folder_probe(probes, root.join("Content").join(&game_path));
    }
    if let Some(content_path) = path_without_first_component(relative, "Content") {
        push_folder_probe(
            probes,
            root.join("UnrealTF").join("Content").join(&content_path),
        );
        push_folder_probe(probes, root.join("Content").join(&content_path));
    }
}

fn existing_folder_target(path: &Path) -> Option<PathBuf> {
    if let Ok(canonical) = path.canonicalize() {
        if canonical.is_dir() {
            return Some(canonical);
        }
        if canonical.is_file() {
            return canonical.parent().map(Path::to_path_buf);
        }
    }

    if path.extension().is_none() {
        for ext in ["umap", "uasset"] {
            let with_ext = path.with_extension(ext);
            if let Ok(canonical) = with_ext.canonicalize() {
                if canonical.is_file() {
                    return canonical.parent().map(Path::to_path_buf);
                }
            }
        }
    }

    None
}

fn resolve_folder_file(folder: &str, path: &str) -> Result<PathBuf, String> {
    let raw = path
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`' | '<' | '>' | '(' | ')' | '[' | ']'));
    if raw.is_empty() {
        return Err("folder path is empty".to_string());
    }

    let candidate = PathBuf::from(raw);
    if candidate.is_absolute() {
        if let Some(target) = existing_folder_target(&candidate) {
            return Ok(target);
        }
        return Err("folder not found".to_string());
    }

    if !is_safe_relative_file_path(&candidate) {
        return Err("invalid folder path".to_string());
    }

    let root = resolve_markdown_root(folder)?;
    let mut probes = Vec::new();
    add_relative_folder_probes(&mut probes, &root, &candidate);
    add_unreal_folder_probes(&mut probes, &root, &candidate);

    if let Some(parent) = root.parent() {
        push_folder_probe(&mut probes, parent.join(&candidate));

        let root_name = root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        let mut sibling_dirs = fs::read_dir(parent)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                if entry.file_type().ok()?.is_dir() {
                    Some(entry.path())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        sibling_dirs.sort_by(|left, right| {
            sibling_image_dir_rank(left, &root_name)
                .cmp(&sibling_image_dir_rank(right, &root_name))
                .then_with(|| left.cmp(right))
        });

        for dir in sibling_dirs {
            if dir == root {
                continue;
            }
            add_relative_folder_probes(&mut probes, &dir, &candidate);
            add_unreal_folder_probes(&mut probes, &dir, &candidate);
        }
    }

    push_folder_probe(&mut probes, candidate);
    for probe in probes {
        if let Some(target) = existing_folder_target(&probe) {
            return Ok(target);
        }
    }

    Err("folder not found".to_string())
}

fn resolve_existing_local_path(path: &str) -> Result<PathBuf, String> {
    let raw = path
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`' | '<' | '>'));
    if raw.is_empty() {
        return Err("path is empty".to_string());
    }

    let candidate = PathBuf::from(raw);
    if !candidate.is_absolute() {
        return Err("path must be absolute".to_string());
    }

    candidate
        .canonicalize()
        .map_err(|e| format!("path not found: {}", e))
}

fn clean_terminal_path_candidate(candidate: &str) -> &str {
    candidate
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`' | '<' | '>'))
        .trim_end_matches(|c| matches!(c, ',' | ';'))
        .trim_end()
}

fn canonicalize_absolute_prefix(raw: &str) -> Option<PathBuf> {
    let cleaned = clean_terminal_path_candidate(raw);
    if cleaned.is_empty() {
        return None;
    }

    let mut boundaries = cleaned
        .char_indices()
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    boundaries.push(cleaned.len());
    boundaries.sort_unstable();
    boundaries.dedup();

    for end in boundaries.into_iter().rev() {
        if end == 0 {
            continue;
        }
        let prefix = clean_terminal_path_candidate(&cleaned[..end]);
        if prefix.is_empty() {
            continue;
        }
        let candidate = PathBuf::from(prefix);
        if !candidate.is_absolute() {
            continue;
        }
        if let Ok(canonical) = candidate.canonicalize() {
            return Some(canonical);
        }
    }

    None
}

fn existing_path_target(path: &Path) -> Option<PathBuf> {
    path.canonicalize()
        .ok()
        .filter(|canonical| canonical.is_file() || canonical.is_dir())
}

fn resolve_terminal_path_file(folder: &str, path: &str) -> Result<PathBuf, String> {
    let raw = clean_terminal_path_candidate(path);
    if raw.is_empty() {
        return Err("path is empty".to_string());
    }

    let candidate = PathBuf::from(raw);
    if candidate.is_absolute() {
        return canonicalize_absolute_prefix(raw)
            .ok_or_else(|| "file or folder not found".to_string());
    }

    if !is_safe_relative_file_path(&candidate) {
        return Err("invalid path".to_string());
    }

    let root = resolve_markdown_root(folder)?;
    let mut probes = Vec::new();
    add_relative_folder_probes(&mut probes, &root, &candidate);

    if let Some(parent) = root.parent() {
        push_folder_probe(&mut probes, parent.join(&candidate));

        let root_name = root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_string();
        let mut sibling_dirs = fs::read_dir(parent)
            .map_err(|e| e.to_string())?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                if entry.file_type().ok()?.is_dir() {
                    Some(entry.path())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        sibling_dirs.sort_by(|left, right| {
            sibling_image_dir_rank(left, &root_name)
                .cmp(&sibling_image_dir_rank(right, &root_name))
                .then_with(|| left.cmp(right))
        });

        for dir in sibling_dirs {
            if dir == root {
                continue;
            }
            add_relative_folder_probes(&mut probes, &dir, &candidate);
        }
    }

    push_folder_probe(&mut probes, candidate);
    for probe in probes {
        if let Some(target) = existing_path_target(&probe) {
            return Ok(target);
        }
    }

    Err("file or folder not found".to_string())
}

fn is_html_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| matches!(e.to_ascii_lowercase().as_str(), "html" | "htm"))
        .unwrap_or(false)
}

fn terminal_path_kind(path: &Path) -> &'static str {
    if path.is_dir() {
        "folder"
    } else if is_image_file(path) {
        "image"
    } else if is_html_file(path) {
        "html"
    } else if is_markdown_file(path) {
        "markdown"
    } else {
        "file"
    }
}

#[cfg(windows)]
fn windows_shell_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(without_prefix) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{}", without_prefix);
    }
    if let Some(without_prefix) = value.strip_prefix(r"\\?\") {
        return without_prefix.to_string();
    }
    value.into_owned()
}

fn open_path_with_system(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(windows_shell_path(path))
            .spawn()
            .map_err(|e| format!("open path failed: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("open path failed: {}", e))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("open path failed: {}", e))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("open path is not supported on this platform".to_string())
}

fn reveal_path_with_system(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        return open_path_with_system(path);
    }

    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", windows_shell_path(path)))
            .spawn()
            .map_err(|e| format!("reveal path failed: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map_err(|e| format!("reveal path failed: {}", e))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(parent) = path.parent() {
            return open_path_with_system(parent);
        }
    }

    #[allow(unreachable_code)]
    Err("reveal path is not supported on this platform".to_string())
}

fn should_skip_markdown_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    matches!(
        name.to_ascii_lowercase().as_str(),
        ".git"
            | ".hg"
            | ".svn"
            | ".claude"
            | ".codex"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".next"
            | ".venv"
            | "vendor"
    )
}

fn collect_markdown_files(
    root: &Path,
    dir: &Path,
    out: &mut Vec<MarkdownFile>,
) -> Result<(), String> {
    if out.len() >= MAX_MARKDOWN_FILES {
        return Ok(());
    }

    let mut entries = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.path());

    for entry in entries {
        if out.len() >= MAX_MARKDOWN_FILES {
            break;
        }
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            if !should_skip_markdown_dir(&path) {
                collect_markdown_files(root, &path, out)?;
            }
        } else if file_type.is_file() && is_markdown_file(&path) {
            let relative = path.strip_prefix(root).map_err(|e| e.to_string())?;
            out.push(MarkdownFile {
                name: path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("document.md")
                    .to_string(),
                relative_path: normalize_relative_path(relative),
            });
        }
    }

    Ok(())
}

fn resolve_markdown_root(folder: &str) -> Result<PathBuf, String> {
    if folder.trim().is_empty() {
        return Err("folder is empty".to_string());
    }
    let root = PathBuf::from(folder);
    if !root.exists() {
        return Err("folder does not exist".to_string());
    }
    root.canonicalize().map_err(|e| e.to_string())
}

fn resolve_markdown_file(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative
        .components()
        .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("invalid markdown path".to_string());
    }
    let path = root.join(relative);
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(root) {
        return Err("markdown path is outside folder".to_string());
    }
    if !is_markdown_file(&canonical) {
        return Err("file is not markdown".to_string());
    }
    Ok(canonical)
}

fn relative_to_markdown_root(root: &Path, path: PathBuf) -> Result<String, String> {
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(root) {
        return Err("markdown path is outside folder".to_string());
    }
    if !is_markdown_file(&canonical) {
        return Err("file is not markdown".to_string());
    }
    let relative = canonical.strip_prefix(root).map_err(|e| e.to_string())?;
    Ok(normalize_relative_path(relative))
}

#[tauri::command]
fn list_markdown_files(folder: String) -> Result<Vec<MarkdownFile>, String> {
    let root = resolve_markdown_root(&folder)?;
    let mut files = Vec::new();
    collect_markdown_files(&root, &root, &mut files)?;
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(files)
}

#[tauri::command]
fn read_markdown_file(folder: String, relative_path: String) -> Result<String, String> {
    let candidate = PathBuf::from(&relative_path);
    let path = if candidate.is_absolute() {
        // Absolute paths (e.g. a doc clicked from terminal output that
        // lives outside the project folder) are read directly.
        let canonical = candidate.canonicalize().map_err(|e| e.to_string())?;
        if !is_markdown_file(&canonical) {
            return Err("file is not markdown".to_string());
        }
        canonical
    } else {
        let root = resolve_markdown_root(&folder)?;
        resolve_markdown_file(&root, &relative_path)?
    };
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_MARKDOWN_FILE_BYTES {
        return Err("markdown file is too large".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn resolve_markdown_path(folder: String, path: String) -> Result<String, String> {
    let root = resolve_markdown_root(&folder)?;
    let raw = path
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`' | '<' | '>'));
    if raw.is_empty() {
        return Err("markdown path is empty".to_string());
    }

    let candidate = PathBuf::from(raw);

    // Absolute path: if it exists and is markdown, open it directly —
    // return a project-relative path when inside the folder, otherwise
    // the canonical absolute path so files outside the project still open.
    if candidate.is_absolute() {
        if let Ok(relative) = relative_to_markdown_root(&root, candidate.clone()) {
            return Ok(relative);
        }
        let canonical = candidate
            .canonicalize()
            .map_err(|e| format!("markdown file not found: {}", e))?;
        if !is_markdown_file(&canonical) {
            return Err("file is not markdown".to_string());
        }
        return Ok(canonical.to_string_lossy().into_owned());
    }

    let candidates = [root.join(&candidate), root.join("Docs").join(&candidate)];
    let mut last_error = "markdown file not found".to_string();
    for path in candidates {
        match relative_to_markdown_root(&root, path) {
            Ok(relative) => return Ok(relative),
            Err(err) => last_error = err,
        }
    }

    Err(last_error)
}

#[tauri::command]
fn resolve_folder_path(folder: String, path: String) -> Result<String, String> {
    resolve_folder_file(&folder, &path).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_folder_path(folder: String, path: String) -> Result<(), String> {
    let target = resolve_folder_file(&folder, &path)?;
    open_path_with_system(&target)
}

#[tauri::command]
fn open_local_path(path: String) -> Result<(), String> {
    let target = resolve_existing_local_path(&path)?;
    open_path_with_system(&target)
}

#[tauri::command]
fn reveal_local_path(path: String) -> Result<(), String> {
    let target = resolve_existing_local_path(&path)?;
    reveal_path_with_system(&target)
}

#[tauri::command]
fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    let target = url.trim();
    let lower = target.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("unsupported url scheme".to_string());
    }

    app.opener()
        .open_url(target.to_string(), None::<&str>)
        .map_err(|e| format!("open url failed: {}", e))
}

#[tauri::command]
fn resolve_terminal_path(folder: String, path: String) -> Result<TerminalPathResolution, String> {
    let target = resolve_terminal_path_file(&folder, &path)?;
    Ok(TerminalPathResolution {
        kind: terminal_path_kind(&target).to_string(),
        path: target.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn spawn_pty(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    shell: Option<String>,
    cwd: Option<String>,
    init_command: Option<String>,
    ai_tool_id: Option<String>,
    ssh: Option<SshSpawn>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    {
        let ptys = state.ptys.lock().unwrap();
        if ptys.contains_key(&id) {
            return Err("이 세션은 이미 현재 창에서 실행 중입니다.".to_string());
        }
    }
    let session_lock = acquire_session_lock(&app, &id)?;

    let hook_port = state.hook_info.port;
    // Reverse-tunnel port for a remote (Windows) session, if hooks are enabled.
    let mut remote_port: Option<u16> = None;

    if ssh.is_none() {
        // Local: merge hooks into the local project folder.
        if let Some(folder) = cwd.as_ref() {
            match ai_tool_id.as_deref() {
                Some("claude") => {
                    let _ = setup_claude_hooks(folder, &state.hook_info.helper_path);
                }
                Some("codex") => {
                    let _ = setup_codex_hooks(folder, &state.hook_info.helper_path);
                }
                _ => {}
            }
        }
    } else if let Some(ref s) = ssh {
        // Remote (Windows only, Phase 2): push the helper + merge remote hooks
        // and allocate a reverse-tunnel port so the remote can reach the local
        // hook server. Best-effort — any failure degrades gracefully (session
        // still spawns, just without status/resume).
        let is_windows = s.remote_os.as_deref() == Some("windows");
        let tool_supported = matches!(ai_tool_id.as_deref(), Some("claude") | Some("codex"));
        // Remote hooks need non-interactive (BatchMode) ssh calls, which can't
        // supply a password — so they only apply to key-auth hosts. Password
        // hosts still connect (PTY auto-types the password) but get no
        // status/resume hooks.
        let key_auth = s.auth_method.as_deref() != Some("password");
        let folder = s
            .remote_folder
            .as_deref()
            .map(str::trim)
            .filter(|f| !f.is_empty());
        if is_windows && tool_supported && key_auth {
            if let Some(folder) = folder {
                remote_port = Some(alloc_remote_port(&state.remote_ports));
                let _guard = state.remote_setup_lock.lock().unwrap();
                let _ = setup_remote_hooks(s, folder, ai_tool_id.as_deref().unwrap_or(""));
            }
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = if let Some(ref s) = ssh {
        // Remote session: drive the local OpenSSH client. The cwd + tool are
        // baked into a single remote command to avoid a typed-init timing race
        // against the SSH handshake.
        let mut c = CommandBuilder::new("ssh");
        c.arg("-tt"); // force remote pty allocation
        for a in ssh_conn_args(s) {
            c.arg(a);
        }
        // Reverse tunnel so the remote's loopback reaches the local hook server.
        // No ExitOnForwardFailure → if the server blocks -R, the session still
        // runs (status/resume just won't work).
        if let Some(rp) = remote_port {
            c.arg("-R");
            c.arg(format!("{}:127.0.0.1:{}", rp, hook_port));
        }
        c.arg(format!("{}@{}", s.user, s.host));
        // Inject hook env into the remote shell (SSH won't forward env).
        let env: Vec<(&'static str, String)> = if let Some(rp) = remote_port {
            vec![
                ("MULTIAGENT_PORT", rp.to_string()),
                ("MULTIAGENT_TOKEN", state.hook_info.token.clone()),
                ("MULTIAGENT_AGENT_ID", id.clone()),
            ]
        } else {
            Vec::new()
        };
        let remote_cmd = build_ssh_remote_command(
            s.remote_folder.as_deref(),
            init_command.as_deref(),
            s.remote_os.as_deref(),
            &env,
        );
        // Empty => drop into the remote's default interactive shell.
        if !remote_cmd.is_empty() {
            c.arg(remote_cmd);
        }
        c
    } else {
        let shell_cmd = shell.unwrap_or_else(default_shell);
        let mut c = CommandBuilder::new(&shell_cmd);
        if cfg!(windows) {
            let lower = shell_cmd.to_ascii_lowercase();
            if lower.ends_with("pwsh.exe") || lower.ends_with("powershell.exe") {
                c.arg("-NoLogo");
            }
        }
        if let Some(cw) = cwd.as_ref() {
            c.cwd(cw);
        }
        c
    };

    cmd.env("MULTIAGENT_PORT", state.hook_info.port.to_string());
    cmd.env("MULTIAGENT_TOKEN", &state.hook_info.token);
    cmd.env("MULTIAGENT_AGENT_ID", &id);

    let child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => {
            if let Some(rp) = remote_port {
                free_remote_port(&state.remote_ports, rp);
            }
            return Err(e.to_string());
        }
    };
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer: Box<dyn Write + Send> = pair.master.take_writer().map_err(|e| e.to_string())?;
    let writer = Arc::new(Mutex::new(writer));

    // Local sessions type the init command after a short delay. SSH sessions
    // already bake it into the remote command above.
    if ssh.is_none() {
        if let Some(init) = init_command.filter(|s| !s.trim().is_empty()) {
            let w = writer.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(600));
                let line = format!("{}\r", init);
                if let Ok(mut guard) = w.lock() {
                    let _ = guard.write_all(line.as_bytes());
                    let _ = guard.flush();
                }
            });
        }
    }

    // Password-auth SSH: auto-type the stored password when the remote shows a
    // password prompt (OpenSSH can't take a password via flag). Looked up by
    // host id from the Rust-side secrets store; never exposed to the frontend.
    let inject_password: Option<String> = match ssh.as_ref() {
        Some(s) if s.auth_method.as_deref() == Some("password") => s
            .host_id
            .as_deref()
            .and_then(|hid| ssh_password_get(&state, hid)),
        _ => None,
    };

    let id_for_thread = id.clone();
    let app_for_thread = app.clone();
    let remote_port_for_thread = remote_port;
    let writer_for_thread = writer.clone();
    #[cfg(not(multiagent_company))]
    let hub_for_thread = state.remote.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pw_injected = inject_password.is_none();
        let mut prompt_tail = String::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    #[cfg(not(multiagent_company))]
                    hub_for_thread.push(&id_for_thread, &buf[..n]);
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    if !pw_injected {
                        prompt_tail.push_str(&data);
                        if prompt_tail.len() > 400 {
                            prompt_tail = prompt_tail.split_off(prompt_tail.len() - 400);
                        }
                        let low = prompt_tail.to_lowercase();
                        if low.contains("password:") || low.contains("password for") {
                            if let Some(pw) = inject_password.as_ref() {
                                if let Ok(mut g) = writer_for_thread.lock() {
                                    let _ = g.write_all(format!("{}\r", pw).as_bytes());
                                    let _ = g.flush();
                                }
                            }
                            pw_injected = true;
                            prompt_tail.clear();
                        }
                    }
                    let _ = app_for_thread.emit(
                        "pty:data",
                        PtyData {
                            id: id_for_thread.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app_for_thread.emit(
            "pty:exit",
            PtyExit {
                id: id_for_thread.clone(),
            },
        );
        {
            let state: State<AppState> = app_for_thread.state();
            let _ = state.ptys.lock().unwrap().remove(&id_for_thread);
            if let Some(rp) = remote_port_for_thread {
                free_remote_port(&state.remote_ports, rp);
            }
        }
        #[cfg(not(multiagent_company))]
        hub_for_thread.drop_agent(&id_for_thread);
    });

    #[cfg(not(multiagent_company))]
    state.remote.set_size(&id, cols, rows);
    state.ptys.lock().unwrap().insert(
        id,
        PtyHandle {
            writer,
            master: pair.master,
            child,
            _session_lock: session_lock,
            remote_port,
        },
    );
    Ok(())
}

#[tauri::command]
fn write_pty(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    let writer = {
        let ptys = state.ptys.lock().unwrap();
        let pty = ptys.get(&id).ok_or("pty not found")?;
        pty.writer.clone()
    };
    let mut guard = writer.lock().map_err(|e| e.to_string())?;
    guard
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    guard.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn resize_pty(state: State<'_, AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    {
        let ptys = state.ptys.lock().unwrap();
        let pty = ptys.get(&id).ok_or("pty not found")?;
        pty.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(multiagent_company))]
    state.remote.set_size(&id, cols, rows);
    Ok(())
}

#[tauri::command]
fn kill_pty(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let freed_port = {
        let mut ptys = state.ptys.lock().unwrap();
        if let Some(mut pty) = ptys.remove(&id) {
            let _ = pty.child.kill();
            pty.remote_port
        } else {
            None
        }
    };
    if let Some(rp) = freed_port {
        free_remote_port(&state.remote_ports, rp);
    }
    #[cfg(not(multiagent_company))]
    state.remote.drop_agent(&id);
    Ok(())
}

/// Connection-level ssh args (-p / -i / extra options) shared by ssh_test, the
/// remote-hook setup calls, and the interactive pty spawn.
fn ssh_conn_args(ssh: &SshSpawn) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    if let Some(port) = ssh.port {
        if port != 0 {
            args.push("-p".to_string());
            args.push(port.to_string());
        }
    }
    let is_password = ssh.auth_method.as_deref() == Some("password");
    let identity = ssh
        .identity_file
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty());
    if is_password {
        // Skip key attempts entirely: avoids "Too many authentication failures"
        // and goes straight to the password method.
        args.push("-o".to_string());
        args.push("PubkeyAuthentication=no".to_string());
        args.push("-o".to_string());
        args.push("PreferredAuthentications=password,keyboard-interactive".to_string());
        args.push("-o".to_string());
        args.push("NumberOfPasswordPrompts=1".to_string());
    } else {
        if let Some(idf) = identity {
            args.push("-i".to_string());
            args.push(idf.to_string());
            // Use only this key (don't offer agent keys) → avoids the server's
            // MaxAuthTries being hit ("Too many authentication failures").
            args.push("-o".to_string());
            args.push("IdentitiesOnly=yes".to_string());
        }
    }
    if let Some(extra) = ssh.extra_options.as_ref() {
        for tok in extra.split_whitespace() {
            args.push(tok.to_string());
        }
    }
    args
}

fn no_window(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = cmd;
}

/// PowerShell single-quoted literal (doubles embedded single quotes).
fn ps_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Encode a PowerShell script for `-EncodedCommand` (UTF-16LE base64). The
/// resulting blob is pure base64 (no spaces/quotes), so it passes cleanly
/// through ssh's arg-join and the remote `cmd /c` re-parse regardless of any
/// spaces/specials inside the script or the paths it references.
fn ps_encoded(ps: &str) -> String {
    use base64::Engine;
    let utf16: Vec<u8> = ps.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    base64::engine::general_purpose::STANDARD.encode(utf16)
}

/// Run a PowerShell `-EncodedCommand` on the remote over ssh (BatchMode, short
/// timeout) and return the process output.
fn run_remote_ps(ssh: &SshSpawn, encoded: &str) -> Result<std::process::Output, String> {
    let mut c = std::process::Command::new("ssh");
    c.arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=8");
    for a in ssh_conn_args(ssh) {
        c.arg(a);
    }
    c.arg(format!("{}@{}", ssh.user, ssh.host));
    c.arg("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-EncodedCommand")
        .arg(encoded);
    no_window(&mut c);
    c.output().map_err(|e| e.to_string())
}

/// Write a UTF-8 text file on a Windows remote (creating parent dirs), via a
/// base64-encoded PowerShell command. Content is base64'd to avoid any quoting.
fn ssh_write_remote_file(ssh: &SshSpawn, remote_path: &str, content: &str) -> Result<(), String> {
    use base64::Engine;
    let content_b64 = base64::engine::general_purpose::STANDARD.encode(content.as_bytes());
    let ps = format!(
        "$ErrorActionPreference='Stop';$p={};$d=[IO.Path]::GetDirectoryName($p);[void][IO.Directory]::CreateDirectory($d);[IO.File]::WriteAllText($p,[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{}')))",
        ps_single_quote(remote_path),
        content_b64
    );
    let enc = ps_encoded(&ps);
    // Guard against the remote cmd.exe ~8191-char command-line limit.
    if enc.len() > 7000 {
        return Err("remote file too large for ssh push".to_string());
    }
    let out = run_remote_ps(ssh, &enc)?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Read a remote text file; returns None if it does not exist.
fn ssh_read_remote_file(ssh: &SshSpawn, remote_path: &str) -> Result<Option<String>, String> {
    use base64::Engine;
    let ps = format!(
        "$ErrorActionPreference='Stop';$p={};if(Test-Path -LiteralPath $p){{[Convert]::ToBase64String([IO.File]::ReadAllBytes($p))}}",
        ps_single_quote(remote_path)
    );
    let enc = ps_encoded(&ps);
    let out = run_remote_ps(ssh, &enc)?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|e| e.to_string())?;
    Ok(Some(String::from_utf8_lossy(&bytes).to_string()))
}

/// Push the remote hook helper and merge our hooks into the remote project's
/// settings/config (Windows remote). Best-effort: callers ignore errors so the
/// session still spawns if anything here fails (graceful degradation).
fn setup_remote_hooks(ssh: &SshSpawn, remote_folder: &str, ai_tool_id: &str) -> Result<(), String> {
    let folder = remote_folder.trim().trim_end_matches(['\\', '/']);
    if folder.is_empty() {
        return Ok(());
    }
    let (subdir, settings_name) = match ai_tool_id {
        "claude" => (".claude", "settings.local.json"),
        "codex" => (".codex", "config.toml"),
        _ => return Ok(()),
    };
    let helper_path = format!("{}\\{}\\multiagent-notify.ps1", folder, subdir);
    let settings_path = format!("{}\\{}\\{}", folder, subdir, settings_name);

    ssh_write_remote_file(ssh, &helper_path, remote_helper_script())?;
    let existing = ssh_read_remote_file(ssh, &settings_path)?.unwrap_or_default();
    let merged = if ai_tool_id == "claude" {
        merge_claude_settings(&existing, &helper_path)?
    } else {
        merge_codex_config(&existing, &helper_path)?
    };
    ssh_write_remote_file(ssh, &settings_path, &merged)?;
    Ok(())
}

fn ssh_secrets_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ssh-secrets.json"))
}

fn load_ssh_secrets(app: &AppHandle) -> HashMap<String, String> {
    if let Ok(path) = ssh_secrets_path(app) {
        if let Ok(raw) = fs::read_to_string(&path) {
            if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&raw) {
                return map;
            }
        }
    }
    HashMap::new()
}

fn save_ssh_secrets(app: &AppHandle, map: &HashMap<String, String>) -> Result<(), String> {
    let path = ssh_secrets_path(app)?;
    let body = serde_json::to_string(map).map_err(|e| e.to_string())?;
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn ssh_password_set(
    app: AppHandle,
    state: State<'_, AppState>,
    host_id: String,
    password: String,
) -> Result<(), String> {
    let mut secrets = state.ssh_secrets.lock().unwrap();
    secrets.insert(host_id, password);
    save_ssh_secrets(&app, &secrets)
}

#[tauri::command]
fn ssh_password_clear(
    app: AppHandle,
    state: State<'_, AppState>,
    host_id: String,
) -> Result<(), String> {
    let mut secrets = state.ssh_secrets.lock().unwrap();
    secrets.remove(&host_id);
    save_ssh_secrets(&app, &secrets)
}

#[tauri::command]
fn ssh_password_has(state: State<'_, AppState>, host_id: String) -> bool {
    state
        .ssh_secrets
        .lock()
        .unwrap()
        .get(&host_id)
        .map(|p| !p.is_empty())
        .unwrap_or(false)
}

/// Look up a stored password (internal — never exposed to the frontend).
fn ssh_password_get(state: &AppState, host_id: &str) -> Option<String> {
    state
        .ssh_secrets
        .lock()
        .unwrap()
        .get(host_id)
        .filter(|p| !p.is_empty())
        .cloned()
}

/// Quick connectivity test for an SSH host. Uses BatchMode so it never blocks
/// on a password prompt (key-based auth only) and a short connect timeout.
#[tauri::command]
fn ssh_test(ssh: SshSpawn) -> Result<String, String> {
    let mut c = std::process::Command::new("ssh");
    c.arg("-o").arg("BatchMode=yes");
    c.arg("-o").arg("ConnectTimeout=8");
    for a in ssh_conn_args(&ssh) {
        c.arg(a);
    }
    c.arg(format!("{}@{}", ssh.user, ssh.host));
    c.arg("echo multiagent-ok");
    no_window(&mut c);
    let out = c
        .output()
        .map_err(|e| format!("ssh 실행 실패 (OpenSSH 클라이언트가 설치되어 있나요?): {e}"))?;
    if out.status.success() && String::from_utf8_lossy(&out.stdout).contains("multiagent-ok") {
        Ok("연결 성공".to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        let msg = err.trim();
        Err(if msg.is_empty() {
            "연결 실패".to_string()
        } else {
            format!("연결 실패: {msg}")
        })
    }
}

fn ssh_dir() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())?;
    Some(PathBuf::from(home).join(".ssh"))
}

/// Read the client's SSH public key (for pasting into a remote's authorized
/// keys). Tries ed25519, then rsa/ecdsa. Returns null when none exists yet.
#[tauri::command]
fn get_ssh_public_key() -> Option<String> {
    let dir = ssh_dir()?;
    for name in ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"] {
        if let Ok(s) = fs::read_to_string(dir.join(name)) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

/// Generate an ed25519 key pair (no passphrase) if none exists, then return the
/// public key. Used by the SSH setup guide's one-click helper.
#[tauri::command]
fn generate_ssh_key() -> Result<String, String> {
    if let Some(key) = get_ssh_public_key() {
        return Ok(key);
    }
    let dir = ssh_dir().ok_or("홈 디렉터리를 찾을 수 없습니다")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let key_path = dir.join("id_ed25519");
    let mut c = std::process::Command::new("ssh-keygen");
    c.arg("-t")
        .arg("ed25519")
        .arg("-N")
        .arg("")
        .arg("-f")
        .arg(&key_path)
        .arg("-C")
        .arg("multiagent-client");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    let out = c
        .output()
        .map_err(|e| format!("ssh-keygen 실행 실패 (OpenSSH 클라이언트 필요): {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "키 생성 실패: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    get_ssh_public_key().ok_or_else(|| "키 생성 후 읽기에 실패했습니다".to_string())
}

#[tauri::command]
fn open_new_app_window(agent_id: Option<String>) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut command = std::process::Command::new(exe);
    command
        .arg("--multiagent-secondary-window")
        .env("MULTIAGENT_SECONDARY_WINDOW", "1");
    if let Some(agent_id) = agent_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        command
            .arg("--multiagent-open-agent")
            .arg(&agent_id)
            .env("MULTIAGENT_OPEN_AGENT_ID", agent_id);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn runtime_flags(state: State<'_, AppState>) -> RuntimeFlags {
    RuntimeFlags {
        secondary_window: state.secondary_window,
        open_agent_id: open_agent_id_arg(),
    }
}

#[cfg(not(multiagent_company))]
mod remote_commands {
    use super::*;

    #[tauri::command]
    pub async fn start_remote_server(app: AppHandle) -> Result<remote::RemoteStatus, String> {
        remote::start(app).await
    }

    #[tauri::command]
    pub fn stop_remote_server(app: AppHandle) -> remote::RemoteStatus {
        remote::stop(&app)
    }

    #[tauri::command]
    pub fn remote_server_status(state: State<'_, AppState>) -> remote::RemoteStatus {
        remote::status(&state.remote)
    }

    #[tauri::command]
    pub fn sync_remote_agents(state: State<'_, AppState>, agents: Vec<remote::RemoteAgentInfo>) {
        if state.secondary_window {
            return;
        }
        *state.remote.agents.lock().unwrap() = agents;
    }

    #[tauri::command]
    pub fn sync_remote_view(state: State<'_, AppState>, view: String) {
        if state.secondary_window {
            return;
        }
        *state.remote.view.lock().unwrap() = view;
    }

    #[tauri::command]
    pub async fn start_tunnel(app: AppHandle) -> Result<remote::TunnelStatus, String> {
        remote::start_tunnel(app).await
    }

    #[tauri::command]
    pub fn stop_tunnel(app: AppHandle) -> remote::TunnelStatus {
        remote::stop_tunnel(&app)
    }

    #[tauri::command]
    pub fn tunnel_status(state: State<'_, AppState>) -> remote::TunnelStatus {
        remote::tunnel_status_of(&state.remote)
    }

    #[tauri::command]
    pub fn remote_access_list(state: State<'_, AppState>) -> remote::AccessStore {
        remote::access_list(&state.remote)
    }

    #[tauri::command]
    pub fn remote_access_approve(state: State<'_, AppState>, login: String) -> remote::AccessStore {
        remote::access_approve(&state.remote, &login)
    }

    #[tauri::command]
    pub fn remote_access_revoke(state: State<'_, AppState>, login: String) -> remote::AccessStore {
        remote::access_revoke(&state.remote, &login)
    }

    #[tauri::command]
    pub fn remote_config_get(state: State<'_, AppState>) -> remote::RemoteConfig {
        remote::config_get(&state.remote)
    }

    #[tauri::command]
    pub fn remote_config_set(
        state: State<'_, AppState>,
        config: remote::RemoteConfig,
    ) -> remote::RemoteConfig {
        remote::config_set(&state.remote, config)
    }
}

#[tauri::command]
fn sync_usage_catalog(
    state: State<'_, AppState>,
    projects: Vec<usage::UsageProjectInfo>,
    agents: Vec<usage::UsageAgentInfo>,
) {
    if state.secondary_window {
        return;
    }
    state.usage.sync_catalog(projects, agents);
}

#[tauri::command]
fn sync_monitor_state(
    state: State<'_, AppState>,
    projects: Vec<monitor::MonitorProjectInfo>,
    agents: Vec<monitor::MonitorAgentInfo>,
    groups: Vec<monitor::MonitorGroupInfo>,
    view: monitor::MonitorViewInfo,
) {
    if state.secondary_window {
        return;
    }
    state.monitor.sync_state(projects, agents, groups, view);
}

#[tauri::command]
async fn start_monitor_server(app: AppHandle) -> Result<monitor::MonitorStatus, String> {
    monitor::start(app).await
}

#[tauri::command]
fn stop_monitor_server(app: AppHandle) -> monitor::MonitorStatus {
    monitor::stop(&app)
}

#[tauri::command]
fn monitor_server_status(state: State<'_, AppState>) -> monitor::MonitorStatus {
    monitor::status(&state.monitor)
}

#[tauri::command]
fn monitor_config_get(state: State<'_, AppState>) -> monitor::MonitorConfig {
    monitor::config_get(&state.monitor)
}

#[tauri::command]
fn monitor_config_set(
    state: State<'_, AppState>,
    config: monitor::MonitorConfig,
) -> monitor::MonitorConfig {
    monitor::config_set(&state.monitor, config)
}

#[tauri::command]
async fn start_usage_server(app: AppHandle) -> Result<usage::UsageStatus, String> {
    usage::start(app).await
}

#[tauri::command]
fn stop_usage_server(app: AppHandle) -> usage::UsageStatus {
    usage::stop(&app)
}

#[tauri::command]
fn usage_server_status(state: State<'_, AppState>) -> usage::UsageStatus {
    usage::status(&state.usage)
}

#[tauri::command]
fn usage_config_get(state: State<'_, AppState>) -> usage::UsageConfig {
    usage::config_get(&state.usage)
}

#[tauri::command]
fn usage_config_set(state: State<'_, AppState>, config: usage::UsageConfig) -> usage::UsageConfig {
    usage::config_set(&state.usage, config)
}

#[tauri::command]
fn usage_ingest_now(state: State<'_, AppState>) -> usage::IngestSummary {
    state.usage.ingest_known_now()
}

#[tauri::command]
fn resolve_cli_session(
    state: State<'_, AppState>,
    ai_tool_id: String,
    folder: String,
    agent_name: Option<String>,
    preferred_session_id: Option<String>,
) -> Result<Option<String>, String> {
    state.usage.resolve_latest_session(
        &ai_tool_id,
        &folder,
        agent_name.as_deref(),
        preferred_session_id.as_deref(),
    )
}

#[tauri::command]
fn relink_cli_session(
    state: State<'_, AppState>,
    ai_tool_id: String,
    folder: String,
    agent_name: Option<String>,
) -> Result<Option<String>, String> {
    state
        .usage
        .find_latest_for_folder(&ai_tool_id, &folder, agent_name.as_deref())
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.show().map_err(|e| e.to_string())?;
    let _ = window.unminimize();
    window.set_focus().map_err(|e| e.to_string())
}

const DESKTOP_PET_LABEL: &str = "desktop-pet";
const DESKTOP_PET_WIDTH: f64 = 184.0;
const DESKTOP_PET_HEIGHT: f64 = 176.0;

fn position_desktop_pet(app: &AppHandle, win: &tauri::WebviewWindow) {
    let monitor = app
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| win.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let scale = monitor.scale_factor();
    let size = monitor.size();
    let origin = monitor.position();
    let win_w = DESKTOP_PET_WIDTH * scale;
    let win_h = DESKTOP_PET_HEIGHT * scale;
    let margin = 18.0 * scale;
    // Tauri does not expose the Windows work area here. Leave enough room for
    // the common bottom taskbar; users can drag the pet when their taskbar is
    // placed elsewhere.
    let taskbar = 52.0 * scale;
    let x = origin.x as f64 + size.width as f64 - win_w - margin;
    let y = origin.y as f64 + size.height as f64 - win_h - margin - taskbar;
    let _ = win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
}

fn create_desktop_pet_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(DESKTOP_PET_LABEL).is_some() {
        return Ok(());
    }
    #[cfg(dev)]
    let pet_url = tauri::WebviewUrl::External(
        "http://localhost:24420/"
            .parse()
            .map_err(|e| format!("desktop pet dev URL: {e}"))?,
    );
    #[cfg(not(dev))]
    let pet_url = tauri::WebviewUrl::App("index.html".into());

    let app_for_pet_load = app.clone();
    let win = tauri::WebviewWindowBuilder::new(app, DESKTOP_PET_LABEL, pet_url)
        .initialization_script("window.__MULTIAGENT_DESKTOP_PET__ = true;")
        .on_page_load(move |window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = window.set_focusable(false);
                position_desktop_pet(&app_for_pet_load, &window);
            }
        })
        .title("MultiAgent Desktop Pet")
        .inner_size(DESKTOP_PET_WIDTH, DESKTOP_PET_HEIGHT)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .transparent(true)
        .shadow(false)
        .build()
        .map_err(|e| e.to_string())?;
    position_desktop_pet(app, &win);
    Ok(())
}

#[tauri::command]
fn set_desktop_pet_enabled(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    // A secondary MultiAgent window is a separate process. Until the shared
    // pet broker lands, only the primary process owns a desktop pet so several
    // identical always-on-top windows cannot stack on the desktop.
    if state.secondary_window {
        return Ok(());
    }

    let existing = app
        .get_webview_window(DESKTOP_PET_LABEL)
        .ok_or_else(|| "desktop pet window was not initialized".to_string())?;
    if enabled {
        existing.set_focusable(false).map_err(|e| e.to_string())?;
        position_desktop_pet(&app, &existing);
        existing.show().map_err(|e| e.to_string())?;
    } else {
        existing.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn update_desktop_pet(
    app: AppHandle,
    state: State<'_, AppState>,
    update: DesktopPetUpdate,
) -> Result<(), String> {
    *state.desktop_pet.lock().unwrap() = update.clone();
    app.emit_to(DESKTOP_PET_LABEL, "desktop-pet:update", update)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn desktop_pet_snapshot(state: State<'_, AppState>) -> DesktopPetUpdate {
    state.desktop_pet.lock().unwrap().clone()
}

#[tauri::command]
fn reset_desktop_pet_position(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(DESKTOP_PET_LABEL) {
        position_desktop_pet(&app, &win);
        app.emit_to(DESKTOP_PET_LABEL, "desktop-pet:position-reset", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn confirm_close(state: State<'_, AppState>, app: AppHandle) {
    #[cfg(not(multiagent_company))]
    state.remote.kill_tunnel();
    *state.close_confirmed.lock().unwrap() = true;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
}

#[cfg(windows)]
extern "system" {
    fn MessageBeep(u_type: u32) -> i32;
}

#[tauri::command]
fn play_system_sound() -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        MessageBeep(0); // MB_OK
    }
    Ok(())
}

#[tauri::command]
fn read_audio_file(path: String) -> Result<Vec<u8>, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("audio file not found".to_string());
    }
    let meta = fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > 10 * 1024 * 1024 {
        return Err("audio file too large (max 10 MB)".to_string());
    }
    fs::read(&p).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_image_data_url(path: String, folder: Option<String>) -> Result<String, String> {
    use base64::Engine;

    let canonical = resolve_image_file(&path, folder.as_deref())?;
    let mime =
        image_mime_type(&canonical).ok_or_else(|| "not a supported image type".to_string())?;

    let meta = fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if meta.len() > 25 * 1024 * 1024 {
        return Err("image too large (max 25 MB)".to_string());
    }
    let bytes = fs::read(&canonical).map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

fn updater_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("multiagent-updater");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn download_installer(url: String, file_name: String) -> Result<String, String> {
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err("invalid file name".to_string());
    }
    let dir = updater_dir()?;
    let target = dir.join(&file_name);

    let response = ureq::get(&url)
        .set("User-Agent", "MultiAgent-Updater")
        .set("Accept", "application/octet-stream")
        .call()
        .map_err(|e| format!("download request failed: {}", e))?;

    let mut reader = response.into_reader();
    let mut file =
        fs::File::create(&target).map_err(|e| format!("create installer file: {}", e))?;
    std::io::copy(&mut reader, &mut file).map_err(|e| format!("write installer file: {}", e))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn run_installer_and_quit(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("installer file not found".to_string());
    }
    let root = updater_dir()?
        .canonicalize()
        .map_err(|e| format!("canonicalize updater dir: {}", e))?;
    let canon = p
        .canonicalize()
        .map_err(|e| format!("canonicalize installer: {}", e))?;
    if !canon.starts_with(&root) {
        return Err("installer is outside updater directory".to_string());
    }
    std::process::Command::new(&canon)
        .spawn()
        .map_err(|e| format!("spawn installer: {}", e))?;
    *state.close_confirmed.lock().unwrap() = true;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_ps_encoded_from_remote_command(command: &str) -> String {
        use base64::Engine;
        let encoded = command.split_whitespace().last().unwrap();
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        let words: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        String::from_utf16(&words).unwrap()
    }

    #[test]
    fn windows_ssh_remote_command_sets_xterm_env_for_tuis() {
        let command = build_ssh_remote_command(
            Some("D:\\AI\\Sub5torage"),
            Some("codex.cmd --dangerously-bypass-approvals-and-sandbox"),
            Some("windows"),
            &[],
        );
        let script = decode_ps_encoded_from_remote_command(&command);

        assert!(script.contains("$env:TERM='xterm-256color';"));
        assert!(script.contains("$env:COLORTERM='truecolor';"));
        assert!(script.contains("Set-Location -LiteralPath 'D:\\AI\\Sub5torage';"));
        assert!(script.contains("codex.cmd --dangerously-bypass-approvals-and-sandbox"));
    }

    #[test]
    fn posix_ssh_remote_command_sets_xterm_env_for_tuis() {
        let command =
            build_ssh_remote_command(Some("/home/me/project"), Some("codex"), Some("posix"), &[]);

        assert_eq!(
            command,
            "export TERM='xterm-256color' COLORTERM='truecolor'; cd '/home/me/project' && exec codex"
        );
    }

    #[test]
    fn image_resolver_finds_docs_path_in_sibling_project_folder() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("multiagent-image-test-{}", unique));
        let project = root.join("ProjectA");
        let image_dir = root
            .join("ProjectA_Toon")
            .join("Docs")
            .join("GameDesign")
            .join("ToonRef")
            .join("Phase4");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&image_dir).unwrap();
        let image = image_dir.join("Capture_BackfaceOutline_Lit.png");
        fs::write(&image, [0_u8, 1, 2, 3]).unwrap();

        let resolved = resolve_image_file(
            "Docs/GameDesign/ToonRef/Phase4/Capture_BackfaceOutline_Lit.png",
            project.to_str(),
        )
        .unwrap();

        assert_eq!(resolved, image.canonicalize().unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn folder_resolver_finds_docs_folder_in_sibling_project_folder() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("multiagent-folder-test-{}", unique));
        let project = root.join("ProjectA");
        let target_dir = root
            .join("ProjectA_Toon")
            .join("Docs")
            .join("GameDesign")
            .join("ToonRef")
            .join("Phase4");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&target_dir).unwrap();

        let resolved =
            resolve_folder_file(project.to_str().unwrap(), "Docs/GameDesign/ToonRef/Phase4")
                .unwrap();

        assert_eq!(resolved, target_dir.canonicalize().unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn folder_resolver_opens_parent_for_unreal_virtual_asset_path() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("multiagent-unreal-test-{}", unique));
        let project = root.join("ProjectA");
        let debug_dir = root
            .join("ProjectA_Toon")
            .join("UnrealTF")
            .join("Content")
            .join("ProjectA_Toon")
            .join("Debug");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&debug_dir).unwrap();
        fs::write(debug_dir.join("Lvl_ToonLit_Capture.umap"), [0_u8]).unwrap();

        let resolved = resolve_folder_file(
            project.to_str().unwrap(),
            "Game/ProjectA_Toon/Debug/Lvl_ToonLit_Capture",
        )
        .unwrap();

        assert_eq!(resolved, debug_dir.canonicalize().unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn folder_resolver_opens_parent_for_file_path() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("multiagent-file-folder-test-{}", unique));
        let project = root.join("ProjectA");
        let target_dir = project.join("Docs").join("Guide");
        fs::create_dir_all(&target_dir).unwrap();
        fs::write(target_dir.join("index.html"), "<html></html>").unwrap();

        let resolved =
            resolve_folder_file(project.to_str().unwrap(), "Docs/Guide/index.html").unwrap();

        assert_eq!(resolved, target_dir.canonicalize().unwrap());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn terminal_path_resolver_uses_longest_existing_absolute_prefix() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("multiagent-terminal-test-{}", unique));
        let project = root.join("ProjectA");
        let target_dir = root.join("Downloads");
        let target = target_dir.join("ChatGPT Image 2026 05 17.png");
        fs::create_dir_all(&project).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        fs::write(&target, [0_u8, 1, 2, 3]).unwrap();

        let raw = format!("{} trailing description", target.to_string_lossy());
        let resolved = resolve_terminal_path_file(project.to_str().unwrap(), &raw).unwrap();

        assert_eq!(resolved, target.canonicalize().unwrap());
        assert_eq!(terminal_path_kind(&resolved), "image");
        let _ = fs::remove_dir_all(root);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let secondary_window = is_secondary_window_process();
            let handle = app.handle().clone();
            let token = uuid::Uuid::new_v4().to_string();
            let helper_path =
                write_helper_script(&handle).map_err(|e| format!("write helper script: {}", e))?;
            let port = start_hook_server(handle.clone(), token.clone())
                .map_err(|e| format!("start hook server: {}", e))?;
            write_hook_info(&handle, port, &token)
                .map_err(|e| format!("write hook info: {}", e))?;
            let monitor_hub = Arc::new(monitor::MonitorHub::new());
            let usage_hub = Arc::new(usage::UsageHub::new());
            app.manage(AppState {
                ptys: Mutex::new(HashMap::new()),
                hook_info: HookInfo {
                    port,
                    token,
                    helper_path: helper_path.to_string_lossy().to_string(),
                },
                close_confirmed: Mutex::new(false),
                secondary_window,
                remote_ports: Mutex::new(HashSet::new()),
                remote_setup_lock: Mutex::new(()),
                ssh_secrets: Mutex::new(load_ssh_secrets(&handle)),
                #[cfg(not(multiagent_company))]
                remote: Arc::new(remote::RemoteHub::new()),
                monitor: monitor_hub,
                usage: usage_hub,
                desktop_pet: Mutex::new(DesktopPetUpdate {
                    status: "idle".to_string(),
                    ..DesktopPetUpdate::default()
                }),
            });
            if !secondary_window {
                create_desktop_pet_window(app.handle())
                    .map_err(|e| format!("create desktop pet: {e}"))?;
            }
            #[cfg(not(multiagent_company))]
            if !secondary_window {
                remote::load_access(app.handle());
            }
            if !secondary_window {
                monitor::load(app.handle()).map_err(|e| format!("load monitor: {}", e))?;
                let state: State<AppState> = app.handle().state();
                if monitor::config_get(&state.monitor).enabled {
                    let app_for_monitor = app.handle().clone();
                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(300));
                        let _ = tauri::async_runtime::block_on(async move {
                            monitor::start(app_for_monitor).await
                        });
                    });
                }
                usage::load(app.handle()).map_err(|e| format!("load usage: {}", e))?;
            }

            // Intercept window close: emit event to frontend so it can
            // gracefully /quit running agents and capture resume tokens.
            if let Some(window) = app.get_webview_window("main") {
                let app_handle_for_event = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let state: State<AppState> = app_handle_for_event.state();
                        let confirmed = *state.close_confirmed.lock().unwrap();
                        if !confirmed {
                            api.prevent_close();
                            let _ = app_handle_for_event.emit("app:close-requested", ());
                        }
                    }
                });
            }
            Ok(())
        });

    #[cfg(not(multiagent_company))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        spawn_pty,
        write_pty,
        resize_pty,
        kill_pty,
        ssh_test,
        ssh_password_set,
        ssh_password_clear,
        ssh_password_has,
        get_ssh_public_key,
        generate_ssh_key,
        open_new_app_window,
        runtime_flags,
        confirm_close,
        list_markdown_files,
        read_markdown_file,
        resolve_markdown_path,
        resolve_folder_path,
        open_folder_path,
        open_local_path,
        reveal_local_path,
        open_external_url,
        resolve_terminal_path,
        download_installer,
        run_installer_and_quit,
        play_system_sound,
        read_audio_file,
        read_image_data_url,
        remote_commands::start_remote_server,
        remote_commands::stop_remote_server,
        remote_commands::remote_server_status,
        remote_commands::sync_remote_agents,
        remote_commands::sync_remote_view,
        remote_commands::start_tunnel,
        remote_commands::stop_tunnel,
        remote_commands::tunnel_status,
        remote_commands::remote_access_list,
        remote_commands::remote_access_approve,
        remote_commands::remote_access_revoke,
        remote_commands::remote_config_get,
        remote_commands::remote_config_set,
        sync_monitor_state,
        start_monitor_server,
        stop_monitor_server,
        monitor_server_status,
        monitor_config_get,
        monitor_config_set,
        sync_usage_catalog,
        start_usage_server,
        stop_usage_server,
        usage_server_status,
        usage_config_get,
        usage_config_set,
        usage_ingest_now,
        resolve_cli_session,
        relink_cli_session,
        show_main_window,
        set_desktop_pet_enabled,
        update_desktop_pet,
        desktop_pet_snapshot,
        reset_desktop_pet_position
    ]);

    #[cfg(multiagent_company)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        spawn_pty,
        write_pty,
        resize_pty,
        kill_pty,
        ssh_test,
        ssh_password_set,
        ssh_password_clear,
        ssh_password_has,
        get_ssh_public_key,
        generate_ssh_key,
        open_new_app_window,
        runtime_flags,
        confirm_close,
        list_markdown_files,
        read_markdown_file,
        resolve_markdown_path,
        resolve_folder_path,
        open_folder_path,
        open_local_path,
        reveal_local_path,
        open_external_url,
        resolve_terminal_path,
        download_installer,
        run_installer_and_quit,
        play_system_sound,
        read_audio_file,
        read_image_data_url,
        sync_monitor_state,
        start_monitor_server,
        stop_monitor_server,
        monitor_server_status,
        monitor_config_get,
        monitor_config_set,
        sync_usage_catalog,
        start_usage_server,
        stop_usage_server,
        usage_server_status,
        usage_config_get,
        usage_config_set,
        usage_ingest_now,
        resolve_cli_session,
        relink_cli_session,
        show_main_window,
        set_desktop_pet_enabled,
        update_desktop_pet,
        desktop_pet_snapshot,
        reset_desktop_pet_position
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
