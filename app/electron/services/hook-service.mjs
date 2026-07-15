import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import http from "node:http";
import path from "node:path";

const HOOK_MARKER = "multiagent";
const EVENTS = [
  ["UserPromptSubmit", "working"],
  ["Stop", "done"],
  ["SessionStart", "session-start"],
];
const CODEX_BEGIN = "# >>> multiagent electron hooks >>>";
const CODEX_END = "# <<< multiagent electron hooks <<<";

const HELPER_SCRIPT = `param([string]$Event)
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$base = Join-Path $env:LOCALAPPDATA "com.jintae.multiagent"
$logPath = Join-Path $base "hook.log"
$infoPath = Join-Path $base "hook-info.json"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
$sessionId = $null
$transcriptPath = $null
$cwd = $null
$prompt = $null
try {
  $stdinText = [Console]::In.ReadToEnd()
  if ($stdinText) {
    $payload = $stdinText | ConvertFrom-Json
    if ($payload.session_id) { $sessionId = [string]$payload.session_id }
    if ($payload.transcript_path) { $transcriptPath = [string]$payload.transcript_path }
    if ($payload.cwd) { $cwd = [string]$payload.cwd }
    if ($payload.prompt) { $prompt = [string]$payload.prompt }
    elseif ($payload.message) { $prompt = [string]$payload.message }
  }
} catch {}
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
function Send-MultiAgentHook([string]$targetPort, [string]$targetToken) {
  $bodyMap = @{ id = $env:MULTIAGENT_AGENT_ID; event = $Event; token = $targetToken }
  if ($sessionId) { $bodyMap.session_id = $sessionId }
  if ($transcriptPath) { $bodyMap.transcript_path = $transcriptPath }
  if ($cwd) { $bodyMap.cwd = $cwd }
  if ($Event -eq "working" -and $prompt) {
    if ($prompt.Length -gt 500) { $prompt = $prompt.Substring(0, 500) }
    $bodyMap.prompt = $prompt
  }
  $body = $bodyMap | ConvertTo-Json -Compress
  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:$targetPort/event" -Body $bodyBytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 2 -UseBasicParsing | Out-Null
}
try {
  Send-MultiAgentHook $port $token
  "$ts |   posted ok port=$port" | Out-File -FilePath $logPath -Append -Encoding utf8
} catch {
  $primaryError = $_
  $recovered = $false
  if (Test-Path $infoPath) {
    try {
      $latest = Get-Content $infoPath -Raw | ConvertFrom-Json
      $latestPort = [string]$latest.port
      $latestToken = [string]$latest.token
      if ($latestPort -and $latestToken -and ($latestPort -ne $port -or $latestToken -ne $token)) {
        Send-MultiAgentHook $latestPort $latestToken
        "$ts |   recovered via hook-info port=$latestPort" | Out-File -FilePath $logPath -Append -Encoding utf8
        $recovered = $true
      }
    } catch { "$ts |   fallback error: $_" | Out-File -FilePath $logPath -Append -Encoding utf8 }
  }
  if (-not $recovered) { "$ts |   error: $primaryError" | Out-File -FilePath $logPath -Append -Encoding utf8 }
}
`;

const NODE_HELPER_SCRIPT = `const chunks=[];
for await (const chunk of process.stdin) chunks.push(chunk);
let input={};
try { input=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}"); } catch {}
const event=process.argv[2]||"";
const payload={id:process.env.MULTIAGENT_AGENT_ID||"",event,token:process.env.MULTIAGENT_TOKEN||""};
if(input.session_id)payload.session_id=String(input.session_id);
if(input.transcript_path)payload.transcript_path=String(input.transcript_path);
if(input.cwd)payload.cwd=String(input.cwd);
const prompt=input.prompt||input.message;
if(event==="working"&&prompt)payload.prompt=String(prompt).slice(0,500);
const port=process.env.MULTIAGENT_PORT;
if(port&&payload.token){try{await fetch("http://127.0.0.1:"+port+"/event",{method:"POST",headers:{"content-type":"application/json; charset=utf-8"},body:JSON.stringify(payload),signal:AbortSignal.timeout(2000)});}catch{}}
`;

function remoteBootstrap(aiToolId) {
  const helperBase64 = Buffer.from(NODE_HELPER_SCRIPT, "utf8").toString("base64");
  return `const fs=require("fs"),path=require("path"),os=require("os");
const dir=path.join(os.homedir(),".multiagent"),helper=path.join(dir,"notify.mjs"),root=process.cwd();
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(helper,Buffer.from(${JSON.stringify(helperBase64)},"base64"));
const command=event=>"node "+JSON.stringify(helper)+" "+event;
const events=[["UserPromptSubmit","working"],["Stop","done"],["SessionStart","session-start"]];
if(${JSON.stringify(aiToolId)}==="claude"){
 const target=path.join(root,".claude","settings.local.json");let settings={};try{settings=JSON.parse(fs.readFileSync(target,"utf8"))}catch{}
 if(!settings||Array.isArray(settings)||typeof settings!=="object")settings={};if(!settings.hooks||typeof settings.hooks!=="object")settings.hooks={};
 for(const [name,event] of events){const current=Array.isArray(settings.hooks[name])?settings.hooks[name]:[];settings.hooks[name]=[...current.filter(item=>item?.__source!=="multiagent"),{matcher:".*",__source:"multiagent",hooks:[{type:"command",command:command(event)}]}]}
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(settings,null,2)+"\\n");
}else if(${JSON.stringify(aiToolId)}==="codex"){
 const target=path.join(root,".codex","config.toml");let body="";try{body=fs.readFileSync(target,"utf8")}catch{}
 body=body.replace(/# >>> multiagent electron hooks >>>[\\s\\S]*?# <<< multiagent electron hooks <<</g,"").trimEnd();
 const lines=["# >>> multiagent electron hooks >>>"];
 for(const [name,event] of events)lines.push("[[hooks."+name+"]]","matcher = \\\"\\\"","__source = \\\"multiagent\\\"","[[hooks."+name+".hooks]]","type = \\\"command\\\"","command = "+JSON.stringify(command(event)),"");
 lines.push("# <<< multiagent electron hooks <<<");fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body+(body?"\\n\\n":"")+lines.join("\\n")+"\\n");
}`;
}

function commandFor(helperPath, event) {
  return `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${helperPath}" ${event}`;
}

async function atomicWrite(filePath, body) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await fsPromises.writeFile(temp, body, "utf8");
  try {
    await fsPromises.rename(temp, filePath);
  } catch {
    await fsPromises.writeFile(filePath, body, "utf8");
    await fsPromises.rm(temp, { force: true }).catch(() => {});
  }
}

function mergeClaude(existing, helperPath) {
  let settings;
  try {
    settings = existing.trim() ? JSON.parse(existing) : {};
  } catch {
    settings = {};
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }
  for (const [eventName, event] of EVENTS) {
    const current = Array.isArray(settings.hooks[eventName]) ? settings.hooks[eventName] : [];
    settings.hooks[eventName] = [
      ...current.filter((entry) => entry?.__source !== HOOK_MARKER),
      {
        matcher: ".*",
        __source: HOOK_MARKER,
        hooks: [{ type: "command", command: commandFor(helperPath, event) }],
      },
    ];
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function removeManagedCodexBlock(existing) {
  const start = existing.indexOf(CODEX_BEGIN);
  const end = existing.indexOf(CODEX_END);
  if (start < 0 || end < start) return existing;
  return `${existing.slice(0, start)}${existing.slice(end + CODEX_END.length)}`.trimEnd();
}

function mergeCodex(existing, helperPath) {
  const cleaned = removeManagedCodexBlock(existing);
  // The current Tauri implementation already writes compatible entries with
  // the same marker and helper path. Keep that valid configuration instead of
  // duplicating every event.
  if (/__source\s*=\s*["']multiagent["']/.test(cleaned)) return cleaned.endsWith("\n") ? cleaned : `${cleaned}\n`;
  const lines = [CODEX_BEGIN];
  for (const [eventName, event] of EVENTS) {
    lines.push(
      `[[hooks.${eventName}]]`,
      `matcher = ""`,
      `__source = "${HOOK_MARKER}"`,
      `[[hooks.${eventName}.hooks]]`,
      `type = "command"`,
      `command = ${JSON.stringify(commandFor(helperPath, event))}`,
      ""
    );
  }
  lines.push(CODEX_END);
  return `${cleaned.trimEnd()}${cleaned.trim() ? "\n\n" : ""}${lines.join("\n")}\n`;
}

export class HookService {
  constructor({ baseDir, sendEvent, sessionService, onHook = null }) {
    this.baseDir = baseDir;
    this.helperPath = path.join(baseDir, "notify.ps1");
    this.infoPath = path.join(baseDir, "hook-info.json");
    this.sendEvent = sendEvent;
    this.sessionService = sessionService;
    this.onHook = onHook;
    this.server = null;
    this.port = 0;
    this.token = "";
    this.mergeQueue = Promise.resolve();
  }

  async start() {
    if (this.server?.listening) return { port: this.port, token: this.token };
    this.token = crypto.randomUUID();
    this.server = http.createServer((request, response) => this.handleRequest(request, response));
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", resolve);
    });
    this.port = this.server.address().port;
    await this.writeRuntimeFiles();
    return { port: this.port, token: this.token };
  }

  async writeRuntimeFiles() {
    await fsPromises.mkdir(this.baseDir, { recursive: true });
    await atomicWrite(this.helperPath, HELPER_SCRIPT);
    await atomicWrite(this.infoPath, JSON.stringify({ port: this.port, token: this.token }));
  }

  handleRequest(request, response) {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200).end("ok");
      return;
    }
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/remote-bootstrap") {
      const tool = url.searchParams.get("tool");
      if (url.searchParams.get("token") !== this.token) {
        response.writeHead(401).end();
      } else if (tool !== "codex" && tool !== "claude") {
        response.writeHead(400).end();
      } else {
        response.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-store",
        }).end(remoteBootstrap(tool));
      }
      return;
    }
    if (request.method !== "POST" || request.url !== "/event") {
      response.writeHead(404).end();
      return;
    }
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes <= 64 * 1024) chunks.push(chunk);
      else request.destroy();
    });
    request.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        response.writeHead(400).end();
        return;
      }
      if (payload?.token !== this.token) {
        response.writeHead(401).end();
        return;
      }
      const event = {
        id: String(payload.id || ""),
        event: String(payload.event || ""),
        session_id: typeof payload.session_id === "string" ? payload.session_id : null,
        transcript_path: typeof payload.transcript_path === "string" ? payload.transcript_path : null,
        cwd: typeof payload.cwd === "string" ? payload.cwd : null,
        prompt:
          typeof payload.prompt === "string" && payload.prompt.trim()
            ? payload.prompt.trim().slice(0, 500)
            : null,
      };
      if (event.id && event.event) {
        await this.sessionService.noteHook(event).catch(() => {});
        await this.onHook?.(event);
        this.sendEvent("agent:hook-event", event);
      }
      response.writeHead(200).end("ok");
    });
  }

  async health() {
    if (!this.server?.listening || !this.port) return false;
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/health`, {
        signal: AbortSignal.timeout(700),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async refresh() {
    let restarted = false;
    if (!(await this.health())) {
      await this.stop();
      await this.start();
      restarted = true;
    } else {
      await this.writeRuntimeFiles();
    }
    return restarted;
  }

  async setupProject(folder, aiToolId) {
    const root = path.resolve(String(folder || ""));
    if (!fs.existsSync(root)) throw new Error("프로젝트 폴더를 찾을 수 없습니다.");
    const task = async () => {
      if (aiToolId === "claude") {
        const target = path.join(root, ".claude", "settings.local.json");
        const before = await fsPromises.readFile(target, "utf8").catch(() => "");
        const after = mergeClaude(before, this.helperPath);
        if (before !== after) await atomicWrite(target, after);
        return before !== after;
      }
      if (aiToolId === "codex") {
        const target = path.join(root, ".codex", "config.toml");
        const before = await fsPromises.readFile(target, "utf8").catch(() => "");
        const after = mergeCodex(before, this.helperPath);
        if (before !== after) await atomicWrite(target, after);
        return before !== after;
      }
      return false;
    };
    const result = this.mergeQueue.then(task, task);
    this.mergeQueue = result.catch(() => {});
    return result;
  }

  async repair(entries) {
    const serverRestarted = await this.refresh();
    const summary = {
      activeSessions: entries.length,
      supportedSessions: 0,
      repaired: 0,
      alreadyHealthy: 0,
      skipped: 0,
      restartRequired: 0,
      serverRestarted,
      failures: [],
    };
    for (const entry of entries) {
      if (!entry.cwd && !entry.ssh || !["codex", "claude"].includes(entry.aiToolId)) {
        summary.skipped += 1;
        continue;
      }
      summary.supportedSessions += 1;
      if (entry.ssh) {
        // Remote bootstrap runs before the CLI starts. An existing SSH process
        // cannot safely have its login command rewritten in place.
        summary.restartRequired += 1;
        continue;
      }
      try {
        const changed = await this.setupProject(entry.cwd, entry.aiToolId);
        if (changed) {
          summary.repaired += 1;
          summary.restartRequired += 1;
        } else {
          summary.alreadyHealthy += 1;
        }
      } catch (error) {
        summary.failures.push({
          agentId: entry.id,
          name: entry.name || entry.id,
          message: String(error),
        });
      }
    }
    return summary;
  }

  async stop() {
    if (!this.server) return;
    const current = this.server;
    this.server = null;
    await new Promise((resolve) => current.close(() => resolve()));
    this.port = 0;
  }
}

export const hookInternals = {
  mergeClaude,
  mergeCodex,
  removeManagedCodexBlock,
  remoteBootstrap,
};
