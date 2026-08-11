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

Standard `electron:pack` / `electron:dist` builds fail closed unless
`MULTIAGENT_MOBILE_APK_PATH` points to a release APK and
`MULTIAGENT_ANDROID_CERT_SHA256` matches its signing certificate. The guard uses Android
SDK `apksigner` and `aapt2` to reject a wrong package id, a debug certificate, a
debuggable manifest, or an APK without `arm64-v8a`. Company builds never consume these
variables and never contain the APK.

The Company build keeps `electron/remote-pwa`'s shared HTML/CSS/JavaScript shell because
the loopback Dashboard serves those files too. It excludes only
`electron/remote-pwa/downloads/**` (the downloadable Android APK); external Remote/Tunnel
remains disabled by the Company runtime variant.

## Android APK

The native Android shell under `mobile/` loads the existing Remote PWA in a
constrained WebView. Metro uses port 4430, separate from the desktop Vite port
4420.

Prerequisites:

- JDK 17
- Android SDK Platform 36 and Build Tools
- Android NDK 27.1.12297006 and CMake 3.22.1 for the Expo native build

The APK is built locally with Expo tooling but does not require an Expo/EAS account,
Firebase project, FCM key, or Play Store registration. Background completion/question
alerts use the app's own Android Foreground Service and the authenticated MultiAgent
Remote endpoint. Put only the initial password in the Git-ignored
`mobile/.env.signing.local` file:

```dotenv
MULTIAGENT_ANDROID_KEYSTORE_PASSWORD=<at least 20 characters>
```

Run `npm run signing:setup` once. It creates the PKCS12 keystore outside the repo under
`%USERPROFILE%\.multiagent-signing`, derives the public certificate SHA-256, and fills the
remaining ignored local configuration without printing the password.

Do not copy a JKS/keystore or passwords into tracked source. `.gitignore` blocks common
credential filenames and `mobile/.env.example` contains placeholders only. The generated
Android project receives the `remoteMessaging` Foreground Service from
`mobile/plugins/withForegroundMonitor.mjs`; no vendor notification credential is read or
bundled.

Build an installable ARM64 APK:

```powershell
cd K:\AI\MultiAgent\mobile
npm install
npm test
npm run typecheck
npm run signing:setup
npm run prebuild:android
npm run apk
```

After prebuild, verify that the merged manifest contains
`FOREGROUND_SERVICE_REMOTE_MESSAGING`, `POST_NOTIFICATIONS`, and the non-exported
`MultiAgentMonitorService`. Starting monitoring is a user action inside the authenticated
APK. Android shows a required ongoing notification while the service keeps a long-poll
connection for every notification-enabled PC profile. Profile URLs and display names are
stored in AsyncStorage; raw monitor tokens and cursors are stored only in the Android
Keystore-encrypted native payload. Only the selected profile owns a visible WebView.

The generated file is
`mobile/android/app/build/outputs/apk/release/app-release.apk`. The checked-in
source excludes generated `mobile/android/`, local SDK/JDK caches, and
`mobile/artifacts/`. Regenerate the Android project with Expo prebuild when
needed. APK binaries are not tracked in Git and ordinary Electron builds exclude
`electron/remote-pwa/downloads/**`.

The signing setup writes an ignored, non-secret local metadata file. Standard Electron
packaging reads the APK path and certificate fingerprint from it automatically:

```powershell
cd K:\AI\MultiAgent\app
npm run electron:dist
```

The verified APK is copied by Electron Builder into the standard installation's
`resources/mobile/MultiAgent-Mobile.apk`; it never enters `app.asar` or the source tree.
The build also stages a publishable copy plus non-secret hash/certificate metadata under
`app/electron-dist/mobile/`. The authenticated Remote top bar shows the APK button only
when that packaged resource exists. Company installers keep the shared Dashboard shell
but do not include the mobile resource.

`npm run apk` refuses to build unless all four release-signing variables are present and
the keystore path exists. The Expo config plugin repeats this check inside Gradle so a
direct `assembleRelease` cannot silently fall back to the public debug key. For local
compile verification only, `npm run apk:verify` explicitly permits debug signing; never
publish that artifact. Keep one stable release keystore outside Git and back it up,
because losing/changing it prevents an installed APK from accepting an in-place update.
Play Store registration is not required for APK sideloading; store publication
additionally needs an upload key and AAB pipeline.

APK builds distributed through desktop release `0.5.98` and earlier used a shared debug
certificate. The first securely signed APK cannot update those installations in
place: uninstall the old APK once, install the new release-signed APK, and keep using the
same protected release keystore for every later update. Do not bypass the guard by
publishing an `apk:verify` artifact merely to preserve the old debug signature.

Company Electron uses the `com.jintae.multiagent.company.electron` identifier and the
`%LOCALAPPDATA%\com.jintae.multiagent.company` shared snapshot, and blocks Remote/Tunnel
commands in main as well.

The Electron local launcher keeps the configured portable command names (`codex`,
`claude`, `qwen`, `cline`) unchanged. It no longer forces npm's Windows `.cmd` shim into
the visible PTY command, resume command, or compatibility arguments. This allows the
active shell and PATH to resolve native executables or user-provided launchers normally.
Windows SSH hosts retain the separate **Use .cmd shims for npm CLIs** compatibility
option because restricted remote PowerShell policies can still block npm `.ps1` shims.

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
