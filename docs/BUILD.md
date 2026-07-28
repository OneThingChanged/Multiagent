# Build & Run

## Prerequisites

- **Node.js** 24+
- **Visual Studio 2022 C++ Build Tools** (MSVC, required by `node-pty`)
- **PowerShell 7+** (falls back to 5.1 if missing)

Rust stable (1.95+) and WebView2 are required only when building or testing the legacy
Tauri transition channel.

## First-time Setup

```bash
cd K:\AI\MultiAgent\app
npm install
```

## Development Mode (HMR)

```bash
cd K:\AI\MultiAgent\app
npm run electron:dev
```

- Vite runs on port 4420, with Electron HMR coordination on port 4422
- `src/**` changes → applied instantly via Vite HMR
- `electron/**` changes require the Electron dev process to restart
- Closing a workspace leaves the Electron tray process alive; use tray **Exit** before
  restarting development when main-process code changed

Windows PTYs are ConPTY-only. The renderer also uses
`windowsPty.backend = "conpty"`; there is no Settings toggle or WinPTY smoke path.
Codex applies the shadow scrollback filter, while Claude and Shell are unfiltered.

Minimum terminal verification:

```bash
cd K:\AI\MultiAgent\app
npm test
npm run build
npm run electron:smoke
```

For installer/security/PTY verification commands and migration criteria, see
[ELECTRON_MIGRATION.md](ELECTRON_MIGRATION.md).

Electron installers are built separately for standard and company.
Only NSIS installers are produced; portable executables are intentionally not built.

| variant | command | updater metadata |
|---|---|---|
| standard | `npm run electron:dist` | `latest.yml` |
| company | `npm run electron:dist:company` | `latest-company.yml` |
| both | `npm run electron:dist:all` | both channels |

Company Electron uses the `com.jintae.multiagent.company.electron` identifier and the
`%LOCALAPPDATA%\com.jintae.multiagent.company` shared snapshot, and blocks Remote/Tunnel
commands in main as well.

The Electron Windows local launcher invokes npm global CLIs as `codex.cmd`/`claude.cmd`.
So even when PowerShell ExecutionPolicy blocks `codex.ps1`, sessions can start without
changing any policy. If you hit the same error when running directly in PowerShell, use
`codex.cmd` or `claude.cmd` as well.

Changing terminal compatibility code does not alter an already-running PTY. Fully exit
the tray process and start a new session before comparing behavior or colors.

## Debug Build

```bash
cd K:\AI\MultiAgent\app
npm run tauri -- build --debug
```

Artifact paths:

| kind | path |
|---|---|
| Debug EXE | `src-tauri/target/debug/app.exe` |
| Debug NSIS installer | `src-tauri/target/debug/bundle/nsis/MultiAgent_<ver>_x64-setup.exe` |
| Debug MSI installer | `src-tauri/target/debug/bundle/msi/MultiAgent_<ver>_x64_en-US.msi` |

Debug builds use the dev profile, so optimization is weak, but they build faster than
release and are good for local verification.

## Release Build

```bash
cd K:\AI\MultiAgent\app
npm run tauri build
```

Artifact paths:

| kind | path |
|---|---|
| Standalone EXE | `src-tauri/target/release/app.exe` |
| NSIS installer | `src-tauri/target/release/bundle/nsis/MultiAgent_<ver>_x64-setup.exe` |
| MSI installer | `src-tauri/target/release/bundle/msi/MultiAgent_<ver>_x64_en-US.msi` |

> Because the Cargo package name is `app`, the standalone EXE is built as `app.exe`. To rename it to `MultiAgent.exe`, change `[package].name` in `Cargo.toml` (keep `[lib].name` as-is).

Without code signing, Windows SmartScreen warns on first launch. Proceed via "More info → Run anyway".

> For publishing (GitHub Releases + updater signing + latest.json), see [RELEASE.md](RELEASE.md). The `npm run tauri build` above is an unsigned local build; release builds need the signing key environment variables.

## Build Variants

For distribution, both variants are prepared together.

| variant | command | difference |
|---|---|---|
| standard | `npm run tauri:build:standard` | all features included |
| company | `npm run tauri:build:company` | Remote tab/server/tunnel features removed |
| both | `npm run tauri:build:all` | builds standard then company in order |
| signed release | `npm run release:build:all` | builds both variants + requires updater manifests |

The company build merges a separate Tauri config (`src-tauri/tauri.company.conf.json`) to
split `productName`, `identifier`, and the updater endpoint. So the standard and company
installs never overwrite each other, and each follows only its own update channel.

For a compile-only check:

```bash
npm run tauri:build:company -- --debug --no-bundle
```

## Dev Troubleshooting

- **Port 4420 in use**: the Vite dev port. Find the PID with `netstat -ano | findstr :4420` and kill the Vite node process (do not touch a release app.exe)
- **`target\debug\app.exe` locked**: a previous app.exe is still alive so overwrite fails. `taskkill /F /IM app.exe`
- **Rebuild takes too long**: cargo only compiles changed crates. Only the first dev build takes 2–3 minutes; afterwards Rust-only changes take ~20s
- **Hooks not firing**: check `%LOCALAPPDATA%\com.jintae.multiagent\hook.log` for diagnostics (notify.ps1 logs timestamp + event + agent + result on every call)
