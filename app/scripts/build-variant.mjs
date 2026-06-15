import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const variant = process.argv[2] || "standard";
const extraArgs = process.argv.slice(3);

if (!["standard", "company"].includes(variant)) {
  console.error(`Unknown build variant: ${variant}`);
  process.exit(1);
}

const appDir = fileURLToPath(new URL("..", import.meta.url));
const tauri = process.platform === "win32"
  ? join(appDir, "node_modules", ".bin", "tauri.cmd")
  : join(appDir, "node_modules", ".bin", "tauri");
const args = ["build", "--ci"];

if (variant === "company") {
  args.push("--config", "src-tauri/tauri.company.conf.json");
}

args.push(...extraArgs);

const result = spawnSync(tauri, args, {
  cwd: appDir,
  env: {
    ...process.env,
    MULTIAGENT_BUILD_VARIANT: variant,
    VITE_MULTIAGENT_VARIANT: variant,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error);
}
if (result.signal) {
  console.error(`Build terminated by signal ${result.signal}`);
}
process.exit(result.status ?? 1);
