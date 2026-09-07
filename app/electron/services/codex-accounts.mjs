import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const validId = (id) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);

// Credentials stay in Codex's own home, never in renderer storage or IPC.
export class CodexAccounts {
  constructor(storageDir, { startLogin, baseEnv = process.env } = {}) {
    this.root = path.join(storageDir, "codex-accounts");
    this.registry = path.join(this.root, "accounts.json");
    this.baseEnv = baseEnv;
    this.startLogin = startLogin;
    this.accounts = [];
    this.login = null;
    this.results = new Map();
    try {
      if (fs.existsSync(this.registry)) {
        const accounts = JSON.parse(fs.readFileSync(this.registry, "utf8"));
        if (!Array.isArray(accounts) || accounts.some((a) => !a || !validId(a.id) || typeof a.label !== "string")) {
          throw new Error("Invalid Codex account registry");
        }
        this.accounts = accounts.map(({ id, label }) => ({ id, label }));
      }
    } catch {
      this.loadError = new Error("Codex 계정 목록을 읽을 수 없습니다. accounts.json 파일을 확인하세요.");
    }
  }

  home(id) {
    if (!id || id === "default") return this.baseEnv.CODEX_HOME || path.join(os.homedir(), ".codex");
    if (!this.accounts.some((a) => a.id === id)) throw new Error("Codex 계정을 찾을 수 없습니다.");
    return path.join(this.root, id, ".codex");
  }

  roots() {
    return [this.home(), ...this.accounts.map((a) => this.home(a.id))].map((home) => path.join(home, "sessions"));
  }

  accountForPath(sourcePath) {
    if (!sourcePath) return null;
    return this.accounts.find((a) => {
      const relative = path.relative(path.join(this.home(a.id), "sessions"), sourcePath);
      return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    }) ?? null;
  }

  environment(id) {
    const env = { ...this.baseEnv };
    if (id && id !== "default") {
      env.CODEX_HOME = this.home(id);
      // An inherited credential must not override the selected ChatGPT login.
      delete env.OPENAI_API_KEY;
      delete env.CODEX_API_KEY;
      delete env.CODEX_ACCESS_TOKEN;
    }
    return env;
  }

  list() {
    if (this.loadError) throw this.loadError;
    return [{ id: "default", label: "기존 로그인", state: "default" }, ...this.accounts.map((a) => ({
      ...a,
      state: this.login?.id === a.id ? "pending" : this.results.get(a.id) ||
        (fs.existsSync(path.join(this.home(a.id), "auth.json")) ? "saved" : "empty"),
    }))];
  }

  create(label) {
    if (this.loadError) throw this.loadError;
    if (typeof label !== "string" || !label.trim() || label.length > 80) throw new Error("계정 이름은 1~80자로 입력하세요.");
    const account = { id: randomUUID(), label: label.trim() };
    fs.mkdirSync(path.join(this.root, account.id, ".codex"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(this.root, account.id, ".codex", "config.toml"), 'cli_auth_credentials_store = "file"\n', { mode: 0o600 });
    const next = [...this.accounts, account];
    fs.writeFileSync(`${this.registry}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(`${this.registry}.tmp`, this.registry);
    this.accounts = next;
    return account.id;
  }

  beginLogin(id) {
    if (!id || id === "default") throw new Error("추가 계정을 선택하세요.");
    this.home(id);
    if (this.login) throw new Error("진행 중인 로그인을 완료하거나 취소하세요.");
    const job = { id, process: null, timer: null };
    this.login = job;
    this.results.delete(id);
    try {
      job.process = this.startLogin(this.environment(id));
      // OAuth output can include authentication URLs. Do not forward or persist it.
      job.process.onData(() => {});
      job.process.onExit(({ exitCode }) => {
        if (this.login !== job) return;
        clearTimeout(job.timer);
        this.login = null;
        this.results.set(id, exitCode === 0 && fs.existsSync(path.join(this.home(id), "auth.json")) ? "saved" : "failed");
      });
      job.timer = setTimeout(() => this.cancelLogin(), 5 * 60_000);
      job.timer.unref?.();
    } catch (error) {
      this.login = null;
      this.results.set(id, "failed");
      throw error;
    }
    return null;
  }

  cancelLogin() {
    const job = this.login;
    if (!job) return;
    this.login = null;
    clearTimeout(job.timer);
    try { job.process?.kill(); } catch { /* login process already exited */ }
    this.results.set(job.id, "cancelled");
  }
}
