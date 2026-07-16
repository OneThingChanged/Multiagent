import fs from "node:fs";
import path from "node:path";

export class UpdaterLifecycle {
  constructor({
    baseDir,
    maxEvents = 100,
    maxLogBytes = 256 * 1024,
    onInstallTimeout = () => {},
  }) {
    this.logPath = path.join(baseDir, "electron-updater.log");
    this.maxEvents = maxEvents;
    this.maxLogBytes = maxLogBytes;
    this.onInstallTimeout = onInstallTimeout;
    this.events = [];
    this.installWatchdog = null;
  }

  record(event, detail = null) {
    const entry = {
      at: new Date().toISOString(),
      event,
      detail: detail == null ? null : String(detail).slice(0, 2_000),
    };
    this.events.push(entry);
    this.events = this.events.slice(-this.maxEvents);
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      const line = `${JSON.stringify(entry)}\n`;
      const currentSize = fs.existsSync(this.logPath)
        ? fs.statSync(this.logPath).size
        : 0;
      if (currentSize + Buffer.byteLength(line) > this.maxLogBytes) {
        const existing = fs.readFileSync(this.logPath);
        const keepFrom = Math.max(0, existing.length - Math.floor(this.maxLogBytes / 2));
        fs.writeFileSync(this.logPath, existing.subarray(keepFrom));
      }
      fs.appendFileSync(this.logPath, line, "utf8");
    } catch {}
    return entry;
  }

  async withTimeout(label, operation, timeoutMs) {
    let timer;
    try {
      const pending =
        typeof operation === "function"
          ? Promise.resolve().then(operation)
          : Promise.resolve(operation);
      return await Promise.race([
        pending,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      this.record(`${label}-failed`, error);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  armInstallWatchdog(timeoutMs = 20_000) {
    this.clearInstallWatchdog();
    this.installWatchdog = setTimeout(() => {
      this.installWatchdog = null;
      this.record("install-exit-timeout");
      this.onInstallTimeout();
    }, timeoutMs);
    this.installWatchdog.unref?.();
  }

  clearInstallWatchdog() {
    if (!this.installWatchdog) return;
    clearTimeout(this.installWatchdog);
    this.installWatchdog = null;
  }

  snapshot() {
    return {
      latestEvent: this.events.at(-1) ?? null,
      events: [...this.events],
      installWatchdogArmed: Boolean(this.installWatchdog),
    };
  }
}
