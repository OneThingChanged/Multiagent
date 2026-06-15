import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const node = process.execPath;
const requireSigned = process.argv.includes("--require-signed");
const extraArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== "--require-signed");

for (const variant of ["standard", "company"]) {
  const result = spawnSync(
    node,
    ["scripts/build-variant.mjs", variant, ...extraArgs],
    {
      cwd: appDir,
      stdio: "inherit",
      env: process.env,
    }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const manifestResult = spawnSync(
  node,
  [
    "scripts/write-latest-json.mjs",
    ...(requireSigned ? [] : ["--allow-missing"]),
  ],
  {
    cwd: appDir,
    stdio: "inherit",
    env: process.env,
  }
);

process.exit(manifestResult.status ?? 1);
