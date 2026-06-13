use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use toml_edit::{value, ArrayOfTables, DocumentMut, Item, Table};

mod remote;
mod usage;

struct PtyHandle {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
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
    remote: Arc<remote::RemoteHub>,
    usage: Arc<usage::UsageHub>,
}

#[derive(Clone, Serialize)]
struct PtyData {
    id: String,
    data: String,
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

const HOOK_MARKER: &str = "multiagent";
const MAX_MARKDOWN_FILES: usize = 500;
const MAX_MARKDOWN_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[cfg(windows)]
fn default_shell() -> String {
    // Order:
    // 1. Microsoft Store PowerShell (7.6+) via WindowsApps app execution alias
    // 2. MSI install of PowerShell 7
    // 3. Windows PowerShell 5.1
    // 4. cmd.exe
    let candidates = [
        std::env::var("LOCALAPPDATA")
            .ok()
            .map(|l| {
                PathBuf::from(l)
                    .join("Microsoft")
                    .join("WindowsApps")
                    .join("pwsh.exe")
            }),
        std::env::var("ProgramFiles")
            .ok()
            .map(|p| PathBuf::from(p).join("PowerShell").join("7").join("pwsh.exe")),
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
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
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
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("hook-info.json");
    let body = serde_json::json!({ "port": port, "token": token }).to_string();
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(())
}

fn start_hook_server(app: AppHandle, token: String) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let server = tiny_http::Server::from_listener(listener, None)
        .map_err(|e| e.to_string())?;

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
fn spawn_pty(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    shell: Option<String>,
    cwd: Option<String>,
    init_command: Option<String>,
    ai_tool_id: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
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

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell_cmd = shell.unwrap_or_else(default_shell);

    let mut cmd = CommandBuilder::new(&shell_cmd);
    if cfg!(windows) {
        let lower = shell_cmd.to_ascii_lowercase();
        if lower.ends_with("pwsh.exe") || lower.ends_with("powershell.exe") {
            cmd.arg("-NoLogo");
        }
    }
    if let Some(c) = cwd.as_ref() {
        cmd.cwd(c);
    }

    cmd.env("MULTIAGENT_PORT", state.hook_info.port.to_string());
    cmd.env("MULTIAGENT_TOKEN", &state.hook_info.token);
    cmd.env("MULTIAGENT_AGENT_ID", &id);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer: Box<dyn Write + Send> = pair.master.take_writer().map_err(|e| e.to_string())?;
    let writer = Arc::new(Mutex::new(writer));

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

    let id_for_thread = id.clone();
    let app_for_thread = app.clone();
    let hub_for_thread = state.remote.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
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
    });

    state.remote.set_size(&id, cols, rows);
    state.ptys.lock().unwrap().insert(
        id,
        PtyHandle {
            writer,
            master: pair.master,
            child,
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
    guard.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
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
    state.remote.set_size(&id, cols, rows);
    Ok(())
}

#[tauri::command]
fn kill_pty(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut ptys = state.ptys.lock().unwrap();
    if let Some(mut pty) = ptys.remove(&id) {
        let _ = pty.child.kill();
    }
    state.remote.drop_agent(&id);
    Ok(())
}

#[tauri::command]
async fn start_remote_server(app: AppHandle) -> Result<remote::RemoteStatus, String> {
    remote::start(app).await
}

#[tauri::command]
fn stop_remote_server(app: AppHandle) -> remote::RemoteStatus {
    remote::stop(&app)
}

#[tauri::command]
fn remote_server_status(state: State<'_, AppState>) -> remote::RemoteStatus {
    remote::status(&state.remote)
}

#[tauri::command]
fn sync_remote_agents(state: State<'_, AppState>, agents: Vec<remote::RemoteAgentInfo>) {
    *state.remote.agents.lock().unwrap() = agents;
}

#[tauri::command]
fn sync_remote_view(state: State<'_, AppState>, view: String) {
    *state.remote.view.lock().unwrap() = view;
}

#[tauri::command]
async fn start_tunnel(app: AppHandle) -> Result<remote::TunnelStatus, String> {
    remote::start_tunnel(app).await
}

#[tauri::command]
fn stop_tunnel(app: AppHandle) -> remote::TunnelStatus {
    remote::stop_tunnel(&app)
}

#[tauri::command]
fn tunnel_status(state: State<'_, AppState>) -> remote::TunnelStatus {
    remote::tunnel_status_of(&state.remote)
}

#[tauri::command]
fn remote_access_list(state: State<'_, AppState>) -> remote::AccessStore {
    remote::access_list(&state.remote)
}

#[tauri::command]
fn remote_access_approve(state: State<'_, AppState>, login: String) -> remote::AccessStore {
    remote::access_approve(&state.remote, &login)
}

#[tauri::command]
fn remote_access_revoke(state: State<'_, AppState>, login: String) -> remote::AccessStore {
    remote::access_revoke(&state.remote, &login)
}

#[tauri::command]
fn remote_config_get(state: State<'_, AppState>) -> remote::RemoteConfig {
    remote::config_get(&state.remote)
}

#[tauri::command]
fn remote_config_set(
    state: State<'_, AppState>,
    config: remote::RemoteConfig,
) -> remote::RemoteConfig {
    remote::config_set(&state.remote, config)
}

#[tauri::command]
fn sync_usage_catalog(
    state: State<'_, AppState>,
    projects: Vec<usage::UsageProjectInfo>,
    agents: Vec<usage::UsageAgentInfo>,
) {
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
fn usage_config_set(
    state: State<'_, AppState>,
    config: usage::UsageConfig,
) -> usage::UsageConfig {
    usage::config_set(&state.usage, config)
}

#[tauri::command]
fn usage_ingest_now(state: State<'_, AppState>) -> usage::IngestSummary {
    state.usage.ingest_known_now()
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

    let raw = PathBuf::from(path.trim());
    let full = if raw.is_absolute() {
        raw
    } else if let Some(f) = folder.filter(|f| !f.trim().is_empty()) {
        PathBuf::from(f).join(&raw)
    } else {
        raw
    };
    let canonical = full
        .canonicalize()
        .map_err(|e| format!("image not found: {}", e))?;

    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        _ => return Err("not a supported image type".to_string()),
    };

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
    let mut file = fs::File::create(&target)
        .map_err(|e| format!("create installer file: {}", e))?;
    std::io::copy(&mut reader, &mut file)
        .map_err(|e| format!("write installer file: {}", e))?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let token = uuid::Uuid::new_v4().to_string();
            let helper_path = write_helper_script(&handle)
                .map_err(|e| format!("write helper script: {}", e))?;
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
                remote: Arc::new(remote::RemoteHub::new()),
                usage: usage_hub,
            });
            remote::load_access(app.handle());
            usage::load(app.handle()).map_err(|e| format!("load usage: {}", e))?;
            {
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
                        let state: State<AppState> =
                            app_handle_for_event.state();
                        let confirmed =
                            *state.close_confirmed.lock().unwrap();
                        if !confirmed {
                            api.prevent_close();
                            let _ = app_handle_for_event
                                .emit("app:close-requested", ());
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spawn_pty,
            write_pty,
            resize_pty,
            kill_pty,
            confirm_close,
            list_markdown_files,
            read_markdown_file,
            resolve_markdown_path,
            download_installer,
            run_installer_and_quit,
            play_system_sound,
            read_audio_file,
            read_image_data_url,
            start_remote_server,
            stop_remote_server,
            remote_server_status,
            sync_remote_agents,
            sync_remote_view,
            start_tunnel,
            stop_tunnel,
            tunnel_status,
            remote_access_list,
            remote_access_approve,
            remote_access_revoke,
            remote_config_get,
            remote_config_set,
            sync_usage_catalog,
            start_usage_server,
            stop_usage_server,
            usage_server_status,
            usage_config_get,
            usage_config_set,
            usage_ingest_now,
            show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
