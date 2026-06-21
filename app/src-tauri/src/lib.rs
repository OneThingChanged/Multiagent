use std::collections::HashMap;
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
use toml_edit::{value, ArrayOfTables, DocumentMut, Item, Table};

#[cfg(not(multiagent_company))]
mod remote;
mod usage;

struct PtyHandle {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    _session_lock: SessionLock,
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
    #[cfg(not(multiagent_company))]
    remote: Arc<remote::RemoteHub>,
    usage: Arc<usage::UsageHub>,
}

#[derive(Clone, Serialize)]
struct PtyData {
    id: String,
    data: String,
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
) -> String {
    let folder = remote_folder.map(str::trim).filter(|f| !f.is_empty());
    let tool = init_command.map(str::trim).filter(|c| !c.is_empty());

    if remote_os == Some("windows") {
        // cmd.exe syntax. `cd /d` also switches drive. `cmd /k` keeps the shell
        // interactive after the cd when there's no tool to run.
        return match (folder, tool) {
            (Some(f), Some(t)) => format!("cd /d \"{}\" && {}", f, t),
            (None, Some(t)) => t.to_string(),
            (Some(f), None) => format!("cmd /k \"cd /d {}\"", f),
            (None, None) => String::new(),
        };
    }

    // POSIX (Linux/macOS) shells.
    let exec_part = match tool {
        Some(t) => format!("exec {}", t),
        None => "exec \"$SHELL\" -l".to_string(),
    };
    match folder {
        // Single-quote the folder for POSIX shells; escape embedded quotes.
        Some(f) => format!("cd '{}' && {}", f.replace('\'', "'\\''"), exec_part),
        None => exec_part,
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
}

const HOOK_MARKER: &str = "multiagent";
const MAX_MARKDOWN_FILES: usize = 500;
const MAX_MARKDOWN_FILE_BYTES: u64 = 2 * 1024 * 1024;

fn is_secondary_window_process() -> bool {
    std::env::var("MULTIAGENT_SECONDARY_WINDOW").ok().as_deref() == Some("1")
        || std::env::args().any(|arg| arg == "--multiagent-secondary-window")
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

fn setup_claude_hooks(folder: &str, helper_path: &str) -> Result<(), String> {
    let claude_dir = Path::new(folder).join(".claude");
    fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.local.json");

    let mut settings: serde_json::Value = if settings_path.exists() {
        fs::read_to_string(&settings_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if !settings.is_object() {
        settings = serde_json::json!({});
    }

    let cmd_for = |arg: &str| {
        format!(
            r#"powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{}" {}"#,
            helper_path, arg
        )
    };

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

    for (event_name, arg) in [
        ("UserPromptSubmit", "working"),
        ("Stop", "done"),
        ("SessionStart", "session-start"),
    ] {
        let entry = hooks_obj
            .entry(event_name.to_string())
            .or_insert_with(|| serde_json::json!([]));
        if !entry.is_array() {
            *entry = serde_json::json!([]);
        }
        let arr = entry.as_array_mut().unwrap();
        arr.retain(|h| h.get("__source").and_then(|s| s.as_str()) != Some(HOOK_MARKER));
        arr.push(our_hook(cmd_for(arg)));
    }

    fs::write(
        &settings_path,
        serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn setup_codex_hooks(folder: &str, helper_path: &str) -> Result<(), String> {
    let codex_dir = Path::new(folder).join(".codex");
    fs::create_dir_all(&codex_dir).map_err(|e| e.to_string())?;
    let config_path = codex_dir.join("config.toml");

    let mut doc: DocumentMut = if config_path.exists() {
        fs::read_to_string(&config_path)
            .map_err(|e| e.to_string())?
            .parse::<DocumentMut>()
            .map_err(|e| e.to_string())?
    } else {
        DocumentMut::new()
    };

    if doc.get("hooks").map(|h| !h.is_table()).unwrap_or(true) {
        doc["hooks"] = Item::Table(Table::new());
    }
    let hooks_table = doc["hooks"].as_table_mut().unwrap();

    let cmd_for = |arg: &str| {
        format!(
            r#"powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{}" {}"#,
            helper_path, arg
        )
    };

    for (event_name, arg) in [
        ("UserPromptSubmit", "working"),
        ("Stop", "done"),
        ("SessionStart", "session-start"),
    ] {
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
        inner.insert("command", value(cmd_for(arg)));
        inner_aot.push(inner);
        entry.insert("hooks", Item::ArrayOfTables(inner_aot));

        aot.push(entry);
    }

    fs::write(&config_path, doc.to_string()).map_err(|e| e.to_string())?;
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

    // Hooks (working/done, session capture, usage) rely on a local hook server
    // and local config files, so they only apply to local sessions. SSH
    // sessions skip them (Phase 1 limitation — see docs/RESUME.md).
    if ssh.is_none() {
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
        if let Some(port) = s.port {
            if port != 0 {
                c.arg("-p");
                c.arg(port.to_string());
            }
        }
        if let Some(idf) = s.identity_file.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
            c.arg("-i");
            c.arg(idf);
        }
        if let Some(extra) = s.extra_options.as_ref() {
            for tok in extra.split_whitespace() {
                c.arg(tok);
            }
        }
        c.arg(format!("{}@{}", s.user, s.host));
        let remote_cmd = build_ssh_remote_command(
            s.remote_folder.as_deref(),
            init_command.as_deref(),
            s.remote_os.as_deref(),
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

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
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

    let id_for_thread = id.clone();
    let app_for_thread = app.clone();
    #[cfg(not(multiagent_company))]
    let hub_for_thread = state.remote.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    #[cfg(not(multiagent_company))]
                    hub_for_thread.push(&id_for_thread, &buf[..n]);
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
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
    let mut ptys = state.ptys.lock().unwrap();
    if let Some(mut pty) = ptys.remove(&id) {
        let _ = pty.child.kill();
    }
    #[cfg(not(multiagent_company))]
    state.remote.drop_agent(&id);
    Ok(())
}

/// Quick connectivity test for an SSH host. Uses BatchMode so it never blocks
/// on a password prompt (key-based auth only) and a short connect timeout.
#[tauri::command]
fn ssh_test(ssh: SshSpawn) -> Result<String, String> {
    let mut c = std::process::Command::new("ssh");
    c.arg("-o").arg("BatchMode=yes");
    c.arg("-o").arg("ConnectTimeout=8");
    if let Some(port) = ssh.port {
        if port != 0 {
            c.arg("-p").arg(port.to_string());
        }
    }
    if let Some(idf) = ssh
        .identity_file
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        c.arg("-i").arg(idf);
    }
    if let Some(extra) = ssh.extra_options.as_ref() {
        for tok in extra.split_whitespace() {
            c.arg(tok);
        }
    }
    c.arg(format!("{}@{}", ssh.user, ssh.host));
    c.arg("echo multiagent-ok");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
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
fn open_new_app_window() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut command = std::process::Command::new(exe);
    command
        .arg("--multiagent-secondary-window")
        .env("MULTIAGENT_SECONDARY_WINDOW", "1");
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
                #[cfg(not(multiagent_company))]
                remote: Arc::new(remote::RemoteHub::new()),
                usage: usage_hub,
            });
            #[cfg(not(multiagent_company))]
            if !secondary_window {
                remote::load_access(app.handle());
            }
            if !secondary_window {
                usage::load(app.handle()).map_err(|e| format!("load usage: {}", e))?;
                let state: State<AppState> = app.handle().state();
                if usage::config_get(&state.usage).enabled {
                    let app_for_usage = app.handle().clone();
                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(500));
                        let _ = tauri::async_runtime::block_on(async move {
                            usage::start(app_for_usage).await
                        });
                    });
                }
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
        sync_usage_catalog,
        start_usage_server,
        stop_usage_server,
        usage_server_status,
        usage_config_get,
        usage_config_set,
        usage_ingest_now,
        resolve_cli_session,
        relink_cli_session,
        show_main_window
    ]);

    #[cfg(multiagent_company)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        spawn_pty,
        write_pty,
        resize_pty,
        kill_pty,
        ssh_test,
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
        resolve_terminal_path,
        download_installer,
        run_installer_and_quit,
        play_system_sound,
        read_audio_file,
        read_image_data_url,
        sync_usage_catalog,
        start_usage_server,
        stop_usage_server,
        usage_server_status,
        usage_config_get,
        usage_config_set,
        usage_ingest_now,
        resolve_cli_session,
        relink_cli_session,
        show_main_window
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
