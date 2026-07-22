import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL(".", import.meta.url));
const packageVersion = JSON.parse(
  readFileSync(`${appDir}/package.json`, "utf8")
).version as string;
const tauriVersion = JSON.parse(
  readFileSync(`${appDir}/src-tauri/tauri.conf.json`, "utf8")
).version as string;
const buildVersion = process.env.MULTIAGENT_BUILD_VARIANT
  ? tauriVersion
  : packageVersion;

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    __MULTIAGENT_APP_VERSION__: JSON.stringify(buildVersion),
  },
  // A relative asset base works in both Tauri's custom protocol and the
  // packaged Electron file:// renderer. Absolute /assets URLs make the
  // packaged Electron window render blank.
  base: "./",

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 4420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 4422,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`, and `electron-dist` —
      // watching electron-builder output kills the dev watcher with EBUSY
      // when a release build runs while electron:dev is open.
      ignored: ["**/src-tauri/**", "**/electron-dist/**"],
    },
  },
}));
