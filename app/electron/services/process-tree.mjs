import path from "node:path";
import { spawnSync } from "node:child_process";

const TASKKILL_TIMEOUT_MS = 5_000;

export function terminateWindowsProcessTree(
  rawPid,
  {
    platform = process.platform,
    systemRoot = process.env.SystemRoot,
    run = spawnSync,
  } = {}
) {
  const pid = Number(rawPid);
  if (platform !== "win32" || !Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }

  const executable = systemRoot
    ? path.join(systemRoot, "System32", "taskkill.exe")
    : "taskkill.exe";
  try {
    const result = run(
      executable,
      ["/PID", String(pid), "/T", "/F"],
      {
        windowsHide: true,
        stdio: "ignore",
        timeout: TASKKILL_TIMEOUT_MS,
      }
    );
    return !result?.error && result?.status === 0;
  } catch {
    return false;
  }
}

