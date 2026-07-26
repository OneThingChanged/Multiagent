import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const builder = process.platform === "win32"
  ? join(appDir, "node_modules", ".bin", "electron-builder.cmd")
  : join(appDir, "node_modules", ".bin", "electron-builder");

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(npm, ["run", "build"], {
  ...process.env,
  VITE_MULTIAGENT_VARIANT: "company",
});
run(builder, ["--win", "nsis", "--config", "electron-builder.company.cjs"]);
