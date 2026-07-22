import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DiagnosticsService,
  redactDiagnosticText,
  sanitizeDiagnostics,
} from "./diagnostics-service.mjs";
import { UpdaterLifecycle } from "./updater-lifecycle.mjs";

const temporaryDirectories = [];
function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-p0-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fsPromises.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("diagnostic bundle", () => {
  it("redacts home paths and credentials recursively", () => {
    const home = "C:\\Users\\tester";
    expect(redactDiagnosticText(`${home} token=abc123 password:hello`, home)).toBe(
      "$HOME token=[REDACTED] password=[REDACTED]"
    );
    expect(sanitizeDiagnostics({ client_secret: "secret", nested: { token: "value" } }, home))
      .toEqual({ client_secret: "[REDACTED]", nested: { token: "[REDACTED]" } });
  });

  it("writes a bounded, sanitized support file", async () => {
    const baseDir = temporaryDirectory();
    const home = path.join(baseDir, "home");
    await fsPromises.writeFile(
      path.join(baseDir, "hook.log"),
      `${home} token=private-value\n`,
      "utf8"
    );
    const service = new DiagnosticsService({
      baseDir,
      homeDir: home,
      appInfoProvider: () => ({ version: "1.0.0" }),
      terminalProvider: () => [{ id: "agent", cwd: home }],
      hookProvider: () => ({ healthy: true, token: "never-export" }),
      updaterProvider: () => ({ events: [] }),
    });
    const target = path.join(baseDir, "bundle.json");
    await expect(service.exportTo(target)).resolves.toMatchObject({
      path: target,
      terminalCount: 1,
      hookHealthy: true,
    });
    const written = await fsPromises.readFile(target, "utf8");
    expect(written).toContain("$HOME");
    expect(written).not.toContain("private-value");
    expect(written).not.toContain("never-export");
  });
});

describe("updater lifecycle", () => {
  it("records operation timeouts and install watchdog fallback", async () => {
    const baseDir = temporaryDirectory();
    let timedOut = false;
    const lifecycle = new UpdaterLifecycle({
      baseDir,
      onInstallTimeout: () => { timedOut = true; },
    });
    await expect(
      lifecycle.withTimeout("check", new Promise(() => {}), 10)
    ).rejects.toThrow("check timed out");
    lifecycle.armInstallWatchdog(10);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(timedOut).toBe(true);
    expect(lifecycle.snapshot().events.map((entry) => entry.event)).toEqual([
      "check-failed",
      "install-exit-timeout",
    ]);
  });

  it("bounds the persistent updater log", () => {
    const baseDir = temporaryDirectory();
    const lifecycle = new UpdaterLifecycle({ baseDir, maxLogBytes: 300 });
    for (let index = 0; index < 30; index += 1) {
      lifecycle.record("progress", `chunk-${index}-${"x".repeat(40)}`);
    }
    expect(fs.statSync(path.join(baseDir, "electron-updater.log")).size).toBeLessThan(500);
  });

  it("records synchronous updater failures", async () => {
    const lifecycle = new UpdaterLifecycle({ baseDir: temporaryDirectory() });
    await expect(
      lifecycle.withTimeout("check", () => { throw new Error("bad feed"); }, 100)
    ).rejects.toThrow("bad feed");
    expect(lifecycle.snapshot().latestEvent?.event).toBe("check-failed");
  });
});
