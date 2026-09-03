import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const packageMetadata = JSON.parse(
  readFileSync(`${appDir}/package.json`, "utf8")
) as { version: string; multiAgentReleaseVersion: string };
const require = createRequire(import.meta.url);
const { resolveReleaseVersions } = require("./scripts/release-version.cjs") as {
  resolveReleaseVersions(metadata: typeof packageMetadata): {
    releaseVersion: string;
    updaterVersion: string;
  };
};
const { releaseVersion } = resolveReleaseVersions(packageMetadata);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    __MULTIAGENT_APP_VERSION__: JSON.stringify(releaseVersion),
  },
  // The packaged Electron renderer loads through file://. Absolute /assets
  // URLs make that window render blank.
  base: "./",

  clearScreen: false,
  server: {
    port: 4420,
    strictPort: true,
    watch: {
      // Watching electron-builder output kills the dev watcher with EBUSY when
      // a release build runs while electron:dev is open.
      ignored: ["**/electron-dist/**"],
    },
  },
}));
