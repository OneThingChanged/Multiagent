import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import http from "node:http";
import path from "node:path";
import { MIRACONTROL_API_VERSION } from "./miracontrol-integration.mjs";

const HOOK_MARKER = "multiagent";
const CODEX_EVENTS = [
  ["UserPromptSubmit", "working"],
  ["PreToolUse", "tool-start"],
  ["PermissionRequest", "waiting"],
  ["PostToolUse", "tool-end"],
  ["Stop", "done"],
  ["SessionStart", "session-start"],
];
const CLAUDE_EVENTS = [
  ...CODEX_EVENTS,
  ["PostToolUseFailure", "working"],
  ["StopFailure", "blocked"],
];
// Qwen Code (Gemini-CLI fork) supports the same event names + StopFailure and
// a Notification event; config lives in .qwen/settings.json (Claude-shaped).
const QWEN_EVENTS = [
  ...CODEX_EVENTS,
  ["StopFailure", "blocked"],
];
const CODEX_BEGIN = "# >>> multiagent electron hooks >>>";
const CODEX_END = "# <<< multiagent electron hooks <<<";
const CODEX_MCP_BEGIN = "# >>> multiagent browser mcp >>>";
const CODEX_MCP_END = "# <<< multiagent browser mcp <<<";
const BROWSER_MCP_NODE_ARGS = [
  "-e",
  "import(require('node:url').pathToFileURL(process.env.MULTIAGENT_MCP_SCRIPT))",
];
const BROWSER_MCP_ENV_VARS = [
  "MULTIAGENT_AGENT_ID",
  "MULTIAGENT_PORT",
  "MULTIAGENT_TOKEN",
  "MULTIAGENT_MCP_SCRIPT",
];
const MAX_INTEGRATION_BODY_BYTES = 16 * 1024;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  }).end(JSON.stringify(payload));
}

function bearerToken(request) {
  const match = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function tokensEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function readIntegrationJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_INTEGRATION_BODY_BYTES) {
      const error = new Error("request too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("invalid json");
    error.status = 400;
    throw error;
  }
}

function integrationAgentId(pathname, action) {
  const match = pathname.match(
    new RegExp(`^/integration/v1/sessions/([^/]+)/${action}$`)
  );
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]).trim();
    return id && id.length <= 256 ? id : null;
  } catch {
    return null;
  }
}

function integrationBrowserRoute(pathname) {
  const match = pathname.match(/^\/integration\/v1\/browser\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return null;
  try {
    const agentId = decodeURIComponent(match[1]).trim();
    const action = match[2] ? decodeURIComponent(match[2]).trim() : "status";
    return agentId && agentId.length <= 256 && action.length <= 80
      ? { agentId, action }
      : null;
  } catch {
    return null;
  }
}

function actionPayload(result) {
  if (!result || typeof result !== "object") return { ok: result !== false };
  const { httpStatus: _httpStatus, ...payload } = result;
  return payload;
}

function limitedString(value, maxLength) {
  if (value == null) return null;
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return null;
  }
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

const HELPER_SCRIPT = `param([string]$Event, [string]$HookEventName)
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $base "hook.log"
$infoPath = Join-Path $base "hook-info.json"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
$sessionId = $null
$transcriptPath = $null
$cwd = $null
$prompt = $null
$toolName = $null
$toolInput = $null
$interactiveQuestion = $null
$assistantMessage = $null
function ConvertTo-CompactText($Value, [int]$MaxLength) {
  if ($null -eq $Value) { return $null }
  try {
    if ($Value -is [string]) { $text = [string]$Value }
    else { $text = $Value | ConvertTo-Json -Compress -Depth 12 }
    if ($text.Length -gt $MaxLength) { return $text.Substring(0, $MaxLength) }
    return $text
  } catch { return $null }
}
try {
  $stdinText = [Console]::In.ReadToEnd()
  if ($stdinText) {
    $payload = $stdinText | ConvertFrom-Json
    if ($payload.session_id) { $sessionId = [string]$payload.session_id }
    if ($payload.transcript_path) { $transcriptPath = [string]$payload.transcript_path }
    if ($payload.cwd) { $cwd = [string]$payload.cwd }
    if ($payload.prompt) { $prompt = [string]$payload.prompt }
    elseif ($payload.message) { $prompt = [string]$payload.message }
    if ($payload.hook_event_name) { $HookEventName = [string]$payload.hook_event_name }
    if ($payload.tool_name) { $toolName = [string]$payload.tool_name }
    if ($payload.tool_input) { $toolInput = ConvertTo-CompactText $payload.tool_input 4000 }
    if ($payload.interactive_question) { $interactiveQuestion = ConvertTo-CompactText $payload.interactive_question 2000 }
    elseif ($toolName -eq "AskUserQuestion" -and $toolInput) { $interactiveQuestion = $toolInput }
    if ($payload.last_assistant_message) { $assistantMessage = ConvertTo-CompactText $payload.last_assistant_message 4000 }
    elseif ($payload.assistant_message) { $assistantMessage = ConvertTo-CompactText $payload.assistant_message 4000 }
    elseif ($payload.response) { $assistantMessage = ConvertTo-CompactText $payload.response 4000 }
  }
} catch {}
$effectiveEvent = $Event
if ($toolName -eq "AskUserQuestion") { $effectiveEvent = "waiting" }
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
"$ts | event=$effectiveEvent | hook=$HookEventName | agent=$($env:MULTIAGENT_AGENT_ID) | session=$sessionId | transcript=$transcriptPath | port=$port" | Out-File -FilePath $logPath -Append -Encoding utf8
if (-not $port -or -not $token) { "$ts |   ! no port/token" | Out-File -FilePath $logPath -Append -Encoding utf8; exit 0 }
function Send-MultiAgentHook([string]$targetPort, [string]$targetToken) {
  $bodyMap = @{ id = $env:MULTIAGENT_AGENT_ID; event = $effectiveEvent; token = $targetToken }
  if ($sessionId) { $bodyMap.session_id = $sessionId }
  if ($transcriptPath) { $bodyMap.transcript_path = $transcriptPath }
  if ($cwd) { $bodyMap.cwd = $cwd }
  if ($HookEventName) { $bodyMap.hook_event_name = $HookEventName }
  if ($prompt) {
    if ($prompt.Length -gt 500) { $prompt = $prompt.Substring(0, 500) }
    $bodyMap.prompt = $prompt
  }
  if ($toolName) { $bodyMap.tool_name = $toolName }
  if ($toolInput) { $bodyMap.tool_input = $toolInput }
  if ($interactiveQuestion) { $bodyMap.interactive_question = $interactiveQuestion }
  if ($assistantMessage) { $bodyMap.assistant_message = $assistantMessage }
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
let event=process.argv[2]||"";
const hookEventName=process.argv[3]||input.hook_event_name||"";
const toolName=input.tool_name?String(input.tool_name):"";
const compact=(value,max)=>{if(value==null)return "";const text=typeof value==="string"?value:JSON.stringify(value);return text.slice(0,max)};
const toolInput=compact(input.tool_input,4000);
if(toolName.toLowerCase()==="askuserquestion")event="waiting";
const payload={id:process.env.MULTIAGENT_AGENT_ID||"",event,token:process.env.MULTIAGENT_TOKEN||""};
if(input.session_id)payload.session_id=String(input.session_id);
if(input.transcript_path)payload.transcript_path=String(input.transcript_path);
if(input.cwd)payload.cwd=String(input.cwd);
const prompt=input.prompt||input.message;
if(prompt)payload.prompt=String(prompt).slice(0,500);
if(hookEventName)payload.hook_event_name=String(hookEventName).slice(0,200);
if(toolName)payload.tool_name=toolName.slice(0,200);
if(toolInput)payload.tool_input=toolInput;
const question=compact(input.interactive_question,2000)||(toolName.toLowerCase()==="askuserquestion"?toolInput:"");
if(question)payload.interactive_question=question;
const assistant=compact(input.last_assistant_message??input.assistant_message??input.response,4000);
if(assistant)payload.assistant_message=assistant;
const port=process.env.MULTIAGENT_PORT;
if(port&&payload.token){try{await fetch("http://127.0.0.1:"+port+"/event",{method:"POST",headers:{"content-type":"application/json; charset=utf-8"},body:JSON.stringify(payload),signal:AbortSignal.timeout(2000)});}catch{}}
`;

function remoteBootstrap(aiToolId) {
  const helperBase64 = Buffer.from(NODE_HELPER_SCRIPT, "utf8").toString("base64");
  const events = aiToolId === "claude" ? CLAUDE_EVENTS : CODEX_EVENTS;
  return `const fs=require("fs"),path=require("path"),os=require("os");
const dir=path.join(os.homedir(),".multiagent"),helper=path.join(dir,"notify.mjs"),root=process.cwd();
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(helper,Buffer.from(${JSON.stringify(helperBase64)},"base64"));
const command=(event,hookName)=>"node "+JSON.stringify(helper)+" "+event+" "+hookName;
const events=${JSON.stringify(events)};
if(${JSON.stringify(aiToolId)}==="claude"){
 const target=path.join(root,".claude","settings.local.json");let settings={};try{settings=JSON.parse(fs.readFileSync(target,"utf8"))}catch{}
 if(!settings||Array.isArray(settings)||typeof settings!=="object")settings={};if(!settings.hooks||typeof settings.hooks!=="object")settings.hooks={};
 for(const [name,event] of events){const current=Array.isArray(settings.hooks[name])?settings.hooks[name]:[];settings.hooks[name]=[...current.filter(item=>item?.__source!=="multiagent"),{matcher:".*",__source:"multiagent",hooks:[{type:"command",command:command(event,name)}]}]}
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(settings,null,2)+"\\n");
}else if(${JSON.stringify(aiToolId)}==="codex"){
 const target=path.join(root,".codex","config.toml");let body="";try{body=fs.readFileSync(target,"utf8")}catch{}
 body=body.replace(/# >>> multiagent electron hooks >>>[\\s\\S]*?# <<< multiagent electron hooks <<</g,"").trimEnd();
 body=body.split(/(?=^\\[\\[hooks\\.[^\\].]+\\]\\]\\s*$)/gm).filter(block=>!/__source\\s*=\\s*["']multiagent["']/.test(block)).join("").trimEnd();
 const lines=["# >>> multiagent electron hooks >>>"];
 for(const [name,event] of events)lines.push("[[hooks."+name+"]]","matcher = \\\"\\\"","__source = \\\"multiagent\\\"","[[hooks."+name+".hooks]]","type = \\\"command\\\"","command = "+JSON.stringify(command(event,name)),"");
 lines.push("# <<< multiagent electron hooks <<<");fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body+(body?"\\n\\n":"")+lines.join("\\n")+"\\n");
}`;
}

function commandFor(helperPath, event, hookEventName) {
  return `powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${helperPath}" ${event} ${hookEventName}`;
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

// Merge our managed hooks into a JSON settings file (Claude .claude/
// settings.local.json, Qwen .qwen/settings.json — same shape), preserving all
// other keys and replacing only our previously-injected (__source) entries.
function mergeJsonSettingsHooks(existing, helperPath, events) {
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
  for (const [eventName, event] of events) {
    const current = Array.isArray(settings.hooks[eventName]) ? settings.hooks[eventName] : [];
    settings.hooks[eventName] = [
      ...current.filter((entry) => entry?.__source !== HOOK_MARKER),
      {
        matcher: ".*",
        __source: HOOK_MARKER,
        hooks: [{ type: "command", command: commandFor(helperPath, event, eventName) }],
      },
    ];
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function mergeClaude(existing, helperPath) {
  return mergeJsonSettingsHooks(existing, helperPath, CLAUDE_EVENTS);
}

function mergeMcpJson(existing, command, scriptPath) {
  if (!command || !scriptPath) return existing;
  let settings;
  try {
    settings = existing.trim() ? JSON.parse(existing) : {};
  } catch {
    settings = {};
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
  if (!settings.mcpServers || typeof settings.mcpServers !== "object" || Array.isArray(settings.mcpServers)) {
    settings.mcpServers = {};
  }
  settings.mcpServers["multiagent-browser"] = {
    type: "stdio",
    command,
    // Keep the machine-local install path out of project files. The Electron
    // PTY supplies MULTIAGENT_MCP_SCRIPT to the child process at runtime.
    args: [...BROWSER_MCP_NODE_ARGS],
  };
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function mergeClaudeMcp(existing, command, scriptPath) {
  return mergeMcpJson(existing, command, scriptPath);
}

function mergeQwen(existing, helperPath) {
  return mergeJsonSettingsHooks(existing, helperPath, QWEN_EVENTS);
}

function removeManagedCodexBlock(existing) {
  const start = existing.indexOf(CODEX_BEGIN);
  const end = existing.indexOf(CODEX_END);
  if (start < 0 || end < start) return existing;
  return `${existing.slice(0, start)}${existing.slice(end + CODEX_END.length)}`.trimEnd();
}

function removeLegacyManagedCodexEntries(existing) {
  return existing
    .split(/(?=^\[\[hooks\.[^\].]+\]\]\s*$)/gm)
    .filter((block) => !/__source\s*=\s*["']multiagent["']/.test(block))
    .join("")
    .trimEnd();
}

function removeManagedCodexMcpBlock(existing) {
  const start = existing.indexOf(CODEX_MCP_BEGIN);
  const end = existing.indexOf(CODEX_MCP_END);
  if (start < 0 || end < start) return existing;
  return `${existing.slice(0, start)}${existing.slice(end + CODEX_MCP_END.length)}`.trimEnd();
}

function mergeCodex(existing, helperPath, mcpScriptPath = "") {
  let cleaned = removeLegacyManagedCodexEntries(removeManagedCodexBlock(existing));
  cleaned = removeManagedCodexMcpBlock(cleaned);
  const lines = [CODEX_BEGIN];
  for (const [eventName, event] of CODEX_EVENTS) {
    lines.push(
      `[[hooks.${eventName}]]`,
      `matcher = ""`,
      `__source = "${HOOK_MARKER}"`,
      `[[hooks.${eventName}.hooks]]`,
      `type = "command"`,
      `command = ${JSON.stringify(commandFor(helperPath, event, eventName))}`,
      ""
    );
  }
  lines.push(CODEX_END);
  if (mcpScriptPath) {
    lines.push(
      "",
      CODEX_MCP_BEGIN,
      "[mcp_servers.multiagent_browser]",
      'command = "node"',
      `args = [${BROWSER_MCP_NODE_ARGS.map((arg) => JSON.stringify(arg)).join(", ")}]`,
      `env_vars = [${BROWSER_MCP_ENV_VARS.map((name) => JSON.stringify(name)).join(", ")}]`,
      "enabled = true",
      CODEX_MCP_END,
    );
  }
  return `${cleaned.trimEnd()}${cleaned.trim() ? "\n\n" : ""}${lines.join("\n")}\n`;
}

export class HookService {
  constructor({
    baseDir,
    sendEvent,
    sessionService,
    onHook = null,
    integrationProvider = null,
    activateAgent = null,
    writeAgentInput = null,
    browserProvider = null,
    mcpScriptPath = "",
  }) {
    this.baseDir = baseDir;
    this.helperPath = path.join(baseDir, "notify.ps1");
    this.infoPath = path.join(baseDir, "hook-info.json");
    this.sendEvent = sendEvent;
    this.sessionService = sessionService;
    this.onHook = onHook;
    this.integrationProvider = integrationProvider;
    this.activateAgent = activateAgent;
    this.writeAgentInput = writeAgentInput;
    this.browserProvider = browserProvider;
    this.mcpScriptPath = mcpScriptPath;
    this.server = null;
    this.port = 0;
    this.token = "";
    this.mergeQueue = Promise.resolve();
    this.recentEvents = [];
    this.lastRepairSummary = null;
    this.lastMaintenance = null;
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
    await atomicWrite(this.infoPath, JSON.stringify({
      port: this.port,
      token: this.token,
      pid: process.pid,
      integrationApiVersion: MIRACONTROL_API_VERSION,
    }));
  }

  integrationAuthorized(request) {
    return !request.headers.origin && tokensEqual(bearerToken(request), this.token);
  }

  async handleIntegrationRequest(request, response, url) {
    if (request.headers.origin) {
      sendJson(response, 403, { ok: false, error: "browser origin blocked" });
      return;
    }
    if (!this.integrationAuthorized(request)) {
      sendJson(response, 401, { ok: false, error: "unauthorized" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/integration/v1/health") {
      sendJson(response, 200, {
        ok: true,
        apiVersion: MIRACONTROL_API_VERSION,
        pid: process.pid,
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/integration/v1/sessions") {
      const snapshot = await this.integrationProvider?.();
      if (!snapshot || typeof snapshot !== "object") {
        sendJson(response, 503, { ok: false, error: "session state unavailable" });
        return;
      }
      sendJson(response, 200, snapshot);
      return;
    }

    const browserRoute = integrationBrowserRoute(url.pathname);
    if (browserRoute && (request.method === "GET" || request.method === "POST")) {
      if (!this.browserProvider) {
        sendJson(response, 501, { ok: false, error: "browser integration unavailable" });
        return;
      }
      let body = {};
      if (request.method === "POST") {
        if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
          sendJson(response, 415, { ok: false, error: "application/json required" });
          return;
        }
        try {
          body = await readIntegrationJson(request);
        } catch (error) {
          sendJson(response, Number(error?.status) || 400, { ok: false, error: error.message });
          return;
        }
      }
      const result = await this.browserProvider({
        agentId: browserRoute.agentId,
        action: browserRoute.action,
        body: body && typeof body === "object" ? body : {},
      });
      const status = Number(result?.httpStatus) || (result?.ok === false ? 409 : 200);
      sendJson(response, status, actionPayload(result));
      return;
    }

    const activateId = integrationAgentId(url.pathname, "activate");
    if (request.method === "POST" && activateId) {
      if (!this.activateAgent) {
        sendJson(response, 501, { ok: false, error: "activation unavailable" });
        return;
      }
      const result = await this.activateAgent(activateId);
      const status = Number(result?.httpStatus) || (result?.ok === false || result === false ? 409 : 202);
      sendJson(response, status, actionPayload(result));
      return;
    }

    const inputId = integrationAgentId(url.pathname, "input");
    if (request.method === "POST" && inputId) {
      if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        sendJson(response, 415, { ok: false, error: "application/json required" });
        return;
      }
      if (!this.writeAgentInput) {
        sendJson(response, 501, { ok: false, error: "input unavailable" });
        return;
      }
      let body;
      try {
        body = await readIntegrationJson(request);
      } catch (error) {
        sendJson(response, Number(error?.status) || 400, { ok: false, error: error.message });
        return;
      }
      const text = typeof body?.text === "string" ? body.text : "";
      const expectedSessionId =
        typeof body?.expectedSessionId === "string"
          ? body.expectedSessionId.trim()
          : "";
      if (
        !text.trim() ||
        text.includes("\0") ||
        Buffer.byteLength(text, "utf8") > 8 * 1024
      ) {
        sendJson(response, 400, { ok: false, error: "invalid input" });
        return;
      }
      const result = await this.writeAgentInput({
        agentId: inputId,
        text,
        submit: body?.submit !== false,
        expectedSessionId,
      });
      const status = Number(result?.httpStatus) || (result?.ok === false || result === false ? 409 : 200);
      sendJson(response, status, actionPayload(result));
      return;
    }

    sendJson(response, 404, { ok: false, error: "not found" });
  }

  handleRequest(request, response) {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200).end("ok");
      return;
    }
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/integration/v1/")) {
      void this.handleIntegrationRequest(request, response, url).catch((error) => {
        if (!response.headersSent) {
          sendJson(response, 500, { ok: false, error: "integration request failed" });
        } else if (!response.writableEnded) {
          response.end();
        }
        console.warn("[electron] MiraControl integration request failed", error);
      });
      return;
    }
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
        hook_event_name: limitedString(payload.hook_event_name, 200),
        received_at: Date.now(),
        prompt: limitedString(payload.prompt, 500),
        tool_name: limitedString(payload.tool_name, 200),
        tool_input: limitedString(payload.tool_input, 4_000),
        interactive_question: limitedString(payload.interactive_question, 2_000),
        assistant_message: limitedString(payload.assistant_message, 4_000),
      };
      if (event.id && event.event) {
        this.recentEvents.push({
          id: event.id,
          event: event.event,
          hookEventName: event.hook_event_name,
          toolName: event.tool_name,
          receivedAt: event.received_at,
          hasSessionId: Boolean(event.session_id),
        });
        this.recentEvents = this.recentEvents.slice(-50);
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
        let mcpChanged = false;
        if (this.mcpScriptPath) {
          const mcpTarget = path.join(root, ".mcp.json");
          const mcpBefore = await fsPromises.readFile(mcpTarget, "utf8").catch(() => "");
          const mcpAfter = mergeClaudeMcp(mcpBefore, "node", this.mcpScriptPath);
          if (mcpBefore !== mcpAfter) {
            await atomicWrite(mcpTarget, mcpAfter);
            mcpChanged = true;
          }
        }
        return before !== after || mcpChanged;
      }
      if (aiToolId === "codex") {
        const target = path.join(root, ".codex", "config.toml");
        const before = await fsPromises.readFile(target, "utf8").catch(() => "");
        const after = mergeCodex(before, this.helperPath, this.mcpScriptPath);
        if (before !== after) await atomicWrite(target, after);
        return before !== after;
      }
      if (aiToolId === "qwen") {
        const target = path.join(root, ".qwen", "settings.json");
        const before = await fsPromises.readFile(target, "utf8").catch(() => "");
        const after = mergeQwen(before, this.helperPath);
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
      if (!entry.cwd && !entry.ssh || !["codex", "claude", "qwen"].includes(entry.aiToolId)) {
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
    this.lastRepairSummary = { ...summary, checkedAt: Date.now() };
    return summary;
  }

  async maintain(entries) {
    const startedAt = Date.now();
    const result = {
      checkedAt: startedAt,
      serverRestarted: false,
      checkedProjects: 0,
      repairedProjects: 0,
      failures: [],
    };
    try {
      result.serverRestarted = await this.refresh();
      for (const entry of entries) {
        if (
          entry.ssh ||
          !entry.cwd ||
          !["codex", "claude", "qwen"].includes(entry.aiToolId)
        ) {
          continue;
        }
        result.checkedProjects += 1;
        try {
          if (await this.setupProject(entry.cwd, entry.aiToolId)) {
            result.repairedProjects += 1;
          }
        } catch (error) {
          result.failures.push({ id: entry.id, message: String(error) });
        }
      }
    } catch (error) {
      result.failures.push({ id: "hook-server", message: String(error) });
    }
    this.lastMaintenance = result;
    return result;
  }

  async diagnostics() {
    return {
      listening: Boolean(this.server?.listening),
      healthy: await this.health(),
      port: this.port || null,
      helperPresent: fs.existsSync(this.helperPath),
      runtimeInfoPresent: fs.existsSync(this.infoPath),
      recentEvents: [...this.recentEvents],
      lastRepairSummary: this.lastRepairSummary,
      lastMaintenance: this.lastMaintenance,
    };
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
  mergeClaudeMcp,
  mergeMcpJson,
  mergeCodex,
  mergeQwen,
  removeManagedCodexBlock,
  remoteBootstrap,
};
