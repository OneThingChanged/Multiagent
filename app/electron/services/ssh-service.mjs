import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function findWindowsExecutable(name) {
  if (process.platform !== "win32") return name;
  const systemCandidate = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "OpenSSH",
    name
  );
  if (fs.existsSync(systemCandidate)) return systemCandidate;
  const result = spawnSync("where.exe", [name], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

export function splitCommandLine(value) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < String(value ?? "").length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = null;
      else if (character === "\\" && value[index + 1] === quote) {
        current += value[++index];
      } else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current) tokens.push(current);
      current = "";
    } else current += character;
  }
  if (quote) throw new Error("SSH 추가 옵션의 따옴표가 닫히지 않았습니다.");
  if (current) tokens.push(current);
  return tokens;
}

function posixQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function powershellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sshConnectionArgs(ssh, { batchMode = false } = {}) {
  const args = [];
  if (batchMode) args.push("-o", "BatchMode=yes");
  args.push("-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=20");
  const port = Number(ssh.port);
  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    args.push("-p", String(port));
  }
  const passwordMode = ssh.authMethod === "password";
  if (passwordMode) {
    args.push(
      "-o",
      "PubkeyAuthentication=no",
      "-o",
      "PreferredAuthentications=password,keyboard-interactive",
      "-o",
      "NumberOfPasswordPrompts=1"
    );
  } else if (ssh.identityFile) {
    args.push("-i", String(ssh.identityFile), "-o", "IdentitiesOnly=yes");
  }
  if (ssh.extraOptions) args.push(...splitCommandLine(ssh.extraOptions));
  return args;
}

export function buildRemoteCommand(ssh, initCommand, hookRuntime) {
  const folder = String(ssh.remoteFolder ?? "").trim();
  const command = String(initCommand ?? "").trim();
  if (String(ssh.remoteOs).toLowerCase() === "windows") {
    const pieces = [
      "$env:TERM='xterm-256color'",
      "$env:COLORTERM='truecolor'",
      `$env:MULTIAGENT_AGENT_ID=${powershellQuote(hookRuntime.agentId)}`,
      `$env:MULTIAGENT_PORT=${powershellQuote(String(hookRuntime.port ?? ""))}`,
      `$env:MULTIAGENT_TOKEN=${powershellQuote(hookRuntime.token ?? "")}`,
    ];
    if (folder) pieces.push(`Set-Location -LiteralPath ${powershellQuote(folder)}`);
    if (hookRuntime.bootstrapUrl) {
      const loader = `fetch(${JSON.stringify(hookRuntime.bootstrapUrl)}).then(r=>{if(!r.ok)throw Error(String(r.status));return r.text()}).then(code=>(0,eval)(code))`;
      const encodedLoader = Buffer.from(loader, "utf8").toString("base64");
      pieces.push(`node -e "eval(Buffer.from('${encodedLoader}','base64').toString())"`);
    }
    if (command) pieces.push(command);
    else pieces.push("powershell -NoLogo");
    const encoded = Buffer.from(pieces.join(";"), "utf16le").toString("base64");
    return `powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
  }

  const environment = [
    "TERM=xterm-256color",
    "COLORTERM=truecolor",
    `MULTIAGENT_AGENT_ID=${posixQuote(hookRuntime.agentId)}`,
    `MULTIAGENT_PORT=${posixQuote(String(hookRuntime.port ?? ""))}`,
    `MULTIAGENT_TOKEN=${posixQuote(hookRuntime.token ?? "")}`,
  ].join(" ");
  const changeDirectory = folder ? `cd -- ${posixQuote(folder)} && ` : "";
  let bootstrap = "";
  if (hookRuntime.bootstrapUrl) {
    const loader = `fetch(${JSON.stringify(hookRuntime.bootstrapUrl)}).then(r=>{if(!r.ok)throw Error(String(r.status));return r.text()}).then(code=>(0,eval)(code))`;
    bootstrap = `node -e ${posixQuote(loader)} && `;
  }
  return `${changeDirectory}${environment} ${bootstrap}${command || "exec \${SHELL:-/bin/sh} -l"}`;
}

export function buildInteractiveSshArgs(ssh, initCommand, hookRuntime) {
  const args = ["-tt", ...sshConnectionArgs(ssh)];
  if (hookRuntime.reversePort && hookRuntime.port) {
    args.push(
      "-o",
      "ExitOnForwardFailure=yes",
      "-R",
      `${hookRuntime.reversePort}:127.0.0.1:${hookRuntime.port}`
    );
  }
  args.push(`${ssh.user}@${ssh.host}`);
  args.push(buildRemoteCommand(ssh, initCommand, {
    ...hookRuntime,
    port: hookRuntime.reversePort || hookRuntime.port,
    bootstrapUrl:
      hookRuntime.bootstrapUrl ||
      (hookRuntime.reversePort && hookRuntime.aiToolId
        ? `http://127.0.0.1:${hookRuntime.reversePort}/remote-bootstrap?token=${encodeURIComponent(hookRuntime.token || "")}&tool=${encodeURIComponent(hookRuntime.aiToolId)}`
        : null),
  }));
  return args;
}

export function testSshConnection(ssh) {
  const executable = findWindowsExecutable(process.platform === "win32" ? "ssh.exe" : "ssh");
  if (!executable) throw new Error("OpenSSH 클라이언트를 찾을 수 없습니다.");
  const result = spawnSync(
    executable,
    [
      ...sshConnectionArgs(ssh, { batchMode: ssh.authMethod !== "password" }),
      `${ssh.user}@${ssh.host}`,
      "echo multiagent-ok",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 12_000 }
  );
  if (result.error) throw result.error;
  if (result.status === 0 && result.stdout.includes("multiagent-ok")) return "연결 성공";
  throw new Error((result.stderr || "연결 실패").trim());
}

export function readPublicKey() {
  for (const name of ["id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"]) {
    const candidate = path.join(os.homedir(), ".ssh", name);
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf8").trim();
  }
  return null;
}

export function generateSshKey() {
  const existing = readPublicKey();
  if (existing) return existing;
  const directory = path.join(os.homedir(), ".ssh");
  fs.mkdirSync(directory, { recursive: true });
  const executable = findWindowsExecutable(
    process.platform === "win32" ? "ssh-keygen.exe" : "ssh-keygen"
  );
  if (!executable) throw new Error("ssh-keygen을 찾을 수 없습니다.");
  const result = spawnSync(
    executable,
    ["-t", "ed25519", "-N", "", "-f", path.join(directory, "id_ed25519"), "-C", "multiagent-client"],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || "SSH 키 생성 실패").trim());
  const generated = readPublicKey();
  if (!generated) throw new Error("SSH 키 생성 후 공개키를 읽지 못했습니다.");
  return generated;
}
