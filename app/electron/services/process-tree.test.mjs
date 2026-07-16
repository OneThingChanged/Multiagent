import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { terminateWindowsProcessTree } from "./process-tree.mjs";

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilExited(pids, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isProcessAlive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

describe("Windows process tree termination", () => {
  it("runs taskkill against the complete tree with a bounded timeout", () => {
    const run = vi.fn(() => ({ status: 0 }));

    expect(terminateWindowsProcessTree(4321, {
      platform: "win32",
      systemRoot: "C:\\Windows",
      run,
    })).toBe(true);
    expect(run).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\taskkill.exe",
      ["/PID", "4321", "/T", "/F"],
      expect.objectContaining({ windowsHide: true, timeout: 5_000 })
    );
  });

  it("rejects invalid pids and non-Windows platforms without spawning", () => {
    const run = vi.fn();
    expect(terminateWindowsProcessTree(0, { platform: "win32", run })).toBe(false);
    expect(terminateWindowsProcessTree(123, { platform: "linux", run })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns false so the PTY owner can fall back when taskkill fails", () => {
    expect(terminateWindowsProcessTree(123, {
      platform: "win32",
      run: () => ({ status: 1 }),
    })).toBe(false);
    expect(terminateWindowsProcessTree(123, {
      platform: "win32",
      run: () => { throw new Error("spawn failed"); },
    })).toBe(false);
  });

  const windowsIt = process.platform === "win32" ? it : it.skip;
  windowsIt("kills a disposable root process and its child", async () => {
    const childScript = [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "console.log(child.pid);",
      "setInterval(() => {}, 1000);",
    ].join(" ");
    const root = spawn(process.execPath, ["-e", childScript], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const childPid = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("child pid timeout")), 5_000);
      root.once("error", reject);
      root.stdout.once("data", (chunk) => {
        clearTimeout(timer);
        resolve(Number(String(chunk).trim()));
      });
    });

    try {
      expect(Number.isSafeInteger(childPid)).toBe(true);
      expect(terminateWindowsProcessTree(root.pid)).toBe(true);
      expect(await waitUntilExited([root.pid, childPid])).toBe(true);
    } finally {
      if (isProcessAlive(root.pid)) process.kill(root.pid);
      if (isProcessAlive(childPid)) process.kill(childPid);
    }
  }, 15_000);
});
