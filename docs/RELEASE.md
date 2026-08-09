# Release & Code Signing Guide

The full procedure for building signed installers, publishing them to GitHub Releases, and having the in-app auto-updater recognize them. For normal dev/debug builds see [BUILD.md](BUILD.md).

## Auto-Updater Overview

Current Electron installs use `electron-updater`:

- standard: `latest.yml`
- company: `latest-company.yml`

Legacy Tauri installs use the signed transition manifests:

- standard: `latest.json`
- company: `latest-company.json`

All four manifests are attached to the same GitHub release, which must be
published and marked **Latest**. Electron Builder writes the YAML manifests and
blockmaps. `release:electron-transition-manifest` writes the JSON manifests
after both NSIS installers have been signed with the existing Tauri updater
key.

## Electron Stable Channel (0.5.31+)

After the official Electron migration, one Latest release maintains both product channels.

| installed state | file queried | next installer |
|---|---|---|
| standard Tauri | `latest.json` | standard Electron NSIS |
| company Tauri | `latest-company.json` | Company Electron NSIS |
| standard Electron | `latest.yml` | standard Electron NSIS |
| Company Electron | `latest-company.yml` | Company Electron NSIS |

Build and transition manifest generation order:

```powershell
cd "K:\AI\MultiAgent\app"
npm run electron:dist:all

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath (Join-Path $env:USERPROFILE ".tauri\multiagent.key") -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run tauri -- signer sign electron-dist/MultiAgent-Setup-<ver>-x64.exe
npm run tauri -- signer sign electron-dist/company/MultiAgentCompany-Setup-<ver>-x64.exe
npm run release:electron-transition-manifest
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
```

The new Latest must include: both NSIS installers + blockmaps, `latest.yml`,
`latest-company.yml`, transition `latest.json`/`latest-company.json` for Tauri, and both
NSIS `.sig` files. Portable executables are not built or published. Company Electron uses
`com.jintae.multiagent.company.electron` and a company-only local-data path, and does not
provide Remote·Tunnel.

## Build Variants

| variant | product name | Electron identifier | updater manifests | remote features |
|---|---|---|---|---|
| standard | `MultiAgent` | `com.jintae.multiagent.electron` | `latest.yml`, `latest.json` | included, including bundled Android APK |
| company | `MultiAgentCompany` | `com.jintae.multiagent.company.electron` | `latest-company.yml`, `latest-company.json` | excluded |

Both variants use the same version but different identifiers and updater endpoints. So a
user who installs standard only gets standard updates, and company only gets company
updates.

The `.electron` suffix remains in the internal Windows AppUserModelID to preserve update
and taskbar identity compatibility, but it is not user-facing. Packaged executables,
shortcuts, uninstall entries, and window names are `MultiAgent` or `MultiAgentCompany`.
Fresh installs use the same product name for the directory under `%LOCALAPPDATA%\Programs`;
existing installs keep their registered directory during an in-place update. On first
packaged startup, only stale `Electron.lnk` shortcuts that point to a development
`node_modules\electron\dist\electron.exe` are removed.

Company still packages the shared `electron/remote-pwa` Dashboard shell. The loopback
Dashboard and external Remote service use the same static files, so excluding that whole
directory breaks Dashboard startup. Company excludes only `remote-pwa/downloads/**`; its
runtime variant continues to disable Remote/Tunnel.

## Signing Key

| item | value |
|---|---|
| private key | `%USERPROFILE%\.tauri\multiagent.key` |
| public key | `%USERPROFILE%\.tauri\multiagent.key.pub` |
| password | none (created with `--ci`, empty string) |
| pubkey location | `app/src-tauri/tauri.conf.json` → `plugins.updater.pubkey` |

- The private key lives outside the repo (home directory) and is **never committed.**
- The pubkey is baked into the app and distributed. Build `.sig` files verify against this pubkey.
- Generating a key pair (first time or re-issue):

```powershell
Set-Location "K:\AI\MultiAgent\app"
$tauriKeyPath = Join-Path $env:USERPROFILE ".tauri\multiagent.key"
npm run tauri -- signer generate -w "$tauriKeyPath" --ci --force
```

> **If you lose the key**, existing users cannot receive auto-updates (signature verification fails). After creating a new key and replacing the pubkey in `tauri.conf.json`, users must **manually install once**. (The key was actually replaced once during the 0.3.x → 0.4.0 transition.)

## Release Procedure

### 1. Bump the stable version

| file | field |
|---|---|
| `app/package.json` | Electron package `"version"` |
| `app/package-lock.json` | root/package versions |
| `app/src-tauri/Cargo.toml` | `[package] version` |
| `app/src-tauri/tauri.conf.json` | `"version"` |

Stable Electron and the legacy Tauri transition manifests use the same version. Include
the root package version in `app/src-tauri/Cargo.lock` as well. The renderer's
`APP_VERSION` is injected from `app/package.json` at build time, so
`app/src/lib/appInfo.ts` has no separate version literal. Electron Builder and
`write-electron-transition-manifest.mjs` read `app/package.json`; the legacy Tauri
manifest writer reads `tauri.conf.json`.

### 2. Quick Verification

For the production Electron channel, even a small hotfix must pass the renderer tests,
production build, and ConPTY round-trip smoke test.

```powershell
cd "K:\AI\MultiAgent\app"
npm test
npm run build
npm run electron:smoke
```

`electron:smoke` is the only Windows PTY backend smoke path. The application always
requests ConPTY, and the former WinPTY selector/smoke test no longer exists. For releases
that also change legacy Tauri transition code, additionally run `cargo test` from
`app/src-tauri`.

When the Android client or Remote APK delivery changes, also run:

```powershell
cd "K:\AI\MultiAgent\mobile"
npm test
npm run typecheck
npx expo-doctor
```

Before packaging, run `npm run signing:setup` and `npm run apk` from `mobile/`. The
standard build reads the ignored local public metadata generated by signing setup.
Standard packaging independently verifies the APK with
Android SDK `apksigner` and `aapt2`; source-tree/debug APKs are excluded unconditionally.

### 3. Signed Build

Electron Builder produces the standard and Company NSIS installers, blockmaps,
and YAML updater manifests. Then use the existing Tauri updater key to sign both
NSIS files for legacy Tauri transition manifests. Even without a password,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""` is required to avoid prompts.

```powershell
cd "K:\AI\MultiAgent\app"
npm run electron:dist:all

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath (Join-Path $env:USERPROFILE ".tauri\multiagent.key") -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

npm run tauri -- signer sign "electron-dist\MultiAgent-Setup-<ver>-x64.exe"
if ($LASTEXITCODE -ne 0) { throw "standard installer signing failed" }
npm run tauri -- signer sign "electron-dist\company\MultiAgentCompany-Setup-<ver>-x64.exe"
if ($LASTEXITCODE -ne 0) { throw "company installer signing failed" }
npm run release:electron-transition-manifest
$releaseCode = $LASTEXITCODE

Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
if ($releaseCode -ne 0) { throw "transition manifest failed: $releaseCode" }
```

> `TAURI_SIGNING_PRIVATE_KEY` takes the **key file contents** (not the path). `TAURI_SIGNING_PRIVATE_KEY_PATH`, which passes a path, can trigger a password prompt depending on the environment and hang headless runs, so use content injection.

On success, both installer `.sig` files and transition JSON manifests exist
beside their matching installers.

### 4. Artifacts

```
app/electron-dist/
  MultiAgent-Setup-<ver>-x64.exe
  MultiAgent-Setup-<ver>-x64.exe.blockmap
  MultiAgent-Setup-<ver>-x64.exe.sig
  latest.yml
  latest.json
  mobile/
    MultiAgent-Mobile.apk
    MultiAgent-Mobile.metadata.json
  company/
    MultiAgentCompany-Setup-<ver>-x64.exe
    MultiAgentCompany-Setup-<ver>-x64.exe.blockmap
    MultiAgentCompany-Setup-<ver>-x64.exe.sig
    latest-company.yml
    latest-company.json
```

### 5. Writing the latest Manifest

Do not hand-edit `latest.yml` or `latest-company.yml`; Electron Builder writes
their installer URL, SHA-512, size, version, and blockmap metadata.

After both `.sig` files exist, run
`npm run release:electron-transition-manifest`. It copies each complete
signature into the matching `latest.json` or `latest-company.json` and points
legacy Tauri users at the Electron NSIS installer.

### 6. Commit / Tag / Push

```bash
cd K:/AI/MultiAgent
git add -A
git commit -m "Release <ver> - <summary>"
git tag v<ver>
git push origin <release-branch>
git push origin v<ver>
```

> If push fails with an SSL error (`unable to get local issuer certificate`), run once:
> `git config --global http.sslBackend schannel`

### 7. Publish the GitHub Release

Key point: **do not keep it as a draft — publish immediately + mark Latest.** (There was an incident where 0.4.4/0.4.5 stayed as drafts and the updater could not see them.)

```bash
gh release create v<ver> --title "v<ver> — <title>" --notes "..." \
  --latest \
  app/electron-dist/MultiAgent-Setup-<ver>-x64.exe \
  app/electron-dist/MultiAgent-Setup-<ver>-x64.exe.blockmap \
  app/electron-dist/MultiAgent-Setup-<ver>-x64.exe.sig \
  app/electron-dist/latest.yml \
  app/electron-dist/latest.json \
  app/electron-dist/company/MultiAgentCompany-Setup-<ver>-x64.exe \
  app/electron-dist/company/MultiAgentCompany-Setup-<ver>-x64.exe.blockmap \
  app/electron-dist/company/MultiAgentCompany-Setup-<ver>-x64.exe.sig \
  app/electron-dist/company/latest-company.yml \
  app/electron-dist/company/latest-company.json \
  app/electron-dist/mobile/MultiAgent-Mobile.apk \
  app/electron-dist/mobile/MultiAgent-Mobile.metadata.json
```

To update/add assets on an existing release:

```bash
gh release upload v<ver> --clobber <files...>
gh release edit v<ver> --draft=false --latest
```

### 8. Verify

```bash
# Does the Latest tag point to this version?
gh api repos/OneThingChanged/Multiagent/releases/latest --jq '.tag_name'
# Are all Electron installers, blockmaps, manifests, signatures, and APK there?
gh release view v<ver> --json assets --jq '.assets[].name'
# Check both transition manifests from the version-direct URL
curl -sL "https://github.com/OneThingChanged/Multiagent/releases/download/v<ver>/latest.json" | grep version
curl -sL "https://github.com/OneThingChanged/Multiagent/releases/download/v<ver>/latest-company.json" | grep version
```

> `/releases/latest/download/latest.json` (the path the updater reads) may serve the old version for a few minutes after publishing due to GitHub CDN caching. If the version-direct URL is correct, all is well; the cache refreshes within minutes.

## Common Pitfalls (Checklist)

- [ ] Are `package.json`, `package-lock.json`, Tauri config/Cargo sources, and Cargo.lock on the same version?
- [ ] Did standard packaging verify the external release APK's package, non-debuggable flag, arm64 ABI, and certificate fingerprint?
- [ ] Is the APK absent from Git/source inputs and present only under `electron-dist/mobile` plus the standard installer's `resources/mobile`?
- [ ] Did `npm run electron:dist:all` create both NSIS installers, blockmaps, and YAML manifests?
- [ ] Were both NSIS files signed with `TAURI_SIGNING_PRIVATE_KEY` (+ empty password)?
- [ ] Is the `signature` in `latest.json` / `latest-company.json` the contents of each variant's **NSIS setup.exe.sig**?
- [ ] Is the release **not a draft + marked Latest**?
- [ ] Did you upload both installers, blockmaps, signatures, four manifests, and the standalone APK?
- [ ] Does `gh api .../releases/latest` point to this tag?

## Unsigned Warning

There is no code signing certificate (EV/OV), so Windows SmartScreen warns on first launch ("More info → Run anyway"). This is separate from the updater signing above (key-based integrity verification).
