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

Native completion/question notifications additionally require an Expo/EAS project and
an Android Firebase app for package `com.OneThingChanged.multiagent.mobile`. Keep the files
and credentials outside the repository, then inject only their local locations:

```powershell
$env:MULTIAGENT_EXPO_PROJECT_ID='your-expo-project-uuid'
$env:MULTIAGENT_GOOGLE_SERVICES_JSON='C:\secure\multiagent\google-services.json'
$env:MULTIAGENT_ANDROID_KEYSTORE_PATH='C:\secure\multiagent\multiagent-release.keystore'
$env:MULTIAGENT_ANDROID_KEYSTORE_PASSWORD='<local secret>'
$env:MULTIAGENT_ANDROID_KEY_ALIAS='multiagent'
$env:MULTIAGENT_ANDROID_KEY_PASSWORD='<local secret>'
```

Create/link the Expo project under the distributor account and upload its Firebase
service-account key as the project's Android **FCM V1** credential in the Expo/EAS
credentials dashboard. The service-account JSON is needed for that one-time credential
setup, but it is not used by this repository or bundled into the APK. Download the
Android app's `google-services.json` from Firebase to the protected path above. None of
these steps requires a Play Store listing.

`mobile/app.config.mjs` reads those variables during prebuild. Do not copy
`google-services.json`, service-account JSON, an Expo access token, a JKS/keystore, or
passwords into tracked source. `.gitignore` blocks the common credential filenames;
`mobile/.env.example` contains placeholders only. If Expo Push enhanced security is
enabled, set `MULTIAGENT_EXPO_ACCESS_TOKEN` only in the desktop process environment.
The Remote service reads it at runtime and never persists or sends it to a browser.

Build an installable ARM64 APK:

```powershell
cd K:\AI\MultiAgent\mobile
npm install
npm test
npm run typecheck
npm run prebuild:android
npm run apk
```

Run `npx expo config --type public` before prebuild and confirm `extra.eas.projectId`
and `android.googleServicesFile` point at the intended account/configuration. A build
without those injected values can still render the Remote WebView, but native push-token
registration will report that the APK is not push configured.

The generated file is
`mobile/android/app/build/outputs/apk/release/app-release.apk`. The checked-in
source excludes generated `mobile/android/`, local SDK/JDK caches, and
`mobile/artifacts/`. Regenerate the Android project with Expo prebuild when
needed. The verified server-distribution copy is tracked separately at
`app/electron/remote-pwa/downloads/MultiAgent-Mobile.apk`.

To publish that APK through the desktop Remote server, copy the verified build
to its stable bundled path before building the standard Electron installer:

```powershell
Copy-Item `
  mobile\android\app\build\outputs\apk\release\app-release.apk `
  app\electron\remote-pwa\downloads\MultiAgent-Mobile.apk `
  -Force
```

`electron/remote-pwa/downloads/**` is unpacked from ASAR so the Remote server can
stream the APK efficiently. Standard installers include it; Company installers
continue to exclude the entire Remote PWA tree. The authenticated Remote top bar
shows the APK button only when this file exists.

`npm run apk` refuses to build unless all four release-signing variables are present and
the keystore path exists. The Expo config plugin repeats this check inside Gradle so a
direct `assembleRelease` cannot silently fall back to the public debug key. For local
compile verification only, `npm run apk:verify` explicitly permits debug signing; never
publish that artifact. Keep one stable release keystore outside Git and back it up,
because losing/changing it prevents an installed APK from accepting an in-place update.
Play Store registration is not required for APK sideloading; store publication
additionally needs an upload key and AAB pipeline.

APK builds distributed through desktop release `0.5.98` and earlier used Expo's shared
debug certificate. The first securely signed APK cannot update those installations in
place: uninstall the old APK once, install the new release-signed APK, and keep using the
same protected release keystore for every later update. Do not bypass the guard by
publishing an `apk:verify` artifact merely to preserve the old debug signature.

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
