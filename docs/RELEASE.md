# Release & Code Signing Guide

The full procedure for building signed installers, publishing them to GitHub Releases, and having the in-app auto-updater recognize them. For normal dev/debug builds see [BUILD.md](BUILD.md).

## Auto-Updater Overview

- The app checks for updates via `tauri-plugin-updater`.
- standard endpoint (`tauri.conf.json` → `plugins.updater.endpoints`): `https://github.com/OneThingChanged/Multiagent/releases/latest/download/latest.json`
- company endpoint (`tauri.company.conf.json`): `https://github.com/OneThingChanged/Multiagent/releases/latest/download/latest-company.json`
- In other words, an installed build variant reads **its own manifest attached to the "Latest" release on GitHub**.
- If `latest.json`'s `version` is higher than the current app version and the `signature` verifies against the **pubkey baked into the app**, an update is offered.

All three must line up for users to see an update:
1. The release must be marked **Latest** (not draft/prerelease)
2. `latest.json` / `latest-company.json` + `.sig` assets must be **attached** to the release
3. The build must be **signed with the correct key** (paired with the pubkey)

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

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath "C:\Users\OneThingChanged\.tauri\multiagent.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run tauri -- signer sign electron-dist/MultiAgent-Electron-Setup-<ver>-x64.exe
npm run tauri -- signer sign electron-dist/company/MultiAgentCompany-Electron-Setup-<ver>-x64.exe
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

| variant | product name | identifier | updater manifest | remote features |
|---|---|---|---|---|
| standard | `MultiAgent` | `com.jintae.multiagent` | `latest.json` | included |
| company | `MultiAgentCompany` | `com.jintae.multiagent.company` | `latest-company.json` | excluded |

Both variants use the same version but different identifiers and updater endpoints. So a
user who installs standard only gets standard updates, and company only gets company
updates.

## Signing Key

| item | value |
|---|---|
| private key | `C:\Users\OneThingChanged\.tauri\multiagent.key` |
| public key | `C:\Users\OneThingChanged\.tauri\multiagent.key.pub` |
| password | none (created with `--ci`, empty string) |
| pubkey location | `app/src-tauri/tauri.conf.json` → `plugins.updater.pubkey` |

- The private key lives outside the repo (home directory) and is **never committed.**
- The pubkey is baked into the app and distributed. Build `.sig` files verify against this pubkey.
- Generating a key pair (first time or re-issue):

```bash
cd K:/AI/MultiAgent/app
npm run tauri -- signer generate -w "C:/Users/OneThingChanged/.tauri/multiagent.key" --ci --force
```

> **If you lose the key**, existing users cannot receive auto-updates (signature verification fails). After creating a new key and replacing the pubkey in `tauri.conf.json`, users must **manually install once**. (The key was actually replaced once during the 0.3.x → 0.4.0 transition.)

## Release Procedure

### 1. Bump the Tauri version (3 source spots)

| file | field |
|---|---|
| `app/src-tauri/Cargo.toml` | `[package] version` |
| `app/src-tauri/tauri.conf.json` | `"version"` |
| `app/src/lib/appInfo.ts` | `APP_VERSION` |

If the 3 spots disagree, Tauri build artifact filenames/displayed versions get crossed. The
root package version in `app/src-tauri/Cargo.lock` must also be included in the final
commit. `app/package.json` and `app/package-lock.json` use the Electron test channel
version (`0.5.x-electron.n`), so they are not matched to Tauri. `write-latest-json.mjs`
also writes manifests based on the `tauri.conf.json` version.

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

### 3. Signed Build

Build with the private key passed as an environment variable. (Even without a password, `_PASSWORD=""` is required to proceed without prompts.)

On PowerShell/Codex environments, use the block below as-is. The private key is injected only into the current process environment and removed right after the build.

```powershell
cd "K:\AI\MultiAgent\app"
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath "C:\Users\OneThingChanged\.tauri\multiagent.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run release:build:all
$code = $LASTEXITCODE
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
if ($code -ne 0) { throw "release build failed: $code" }
```

On Bash/Git Bash, run:

```bash
cd K:/AI/MultiAgent/app
export TAURI_SIGNING_PRIVATE_KEY="$(cat /c/Users/OneThingChanged/.tauri/multiagent.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run release:build:all
```

> `TAURI_SIGNING_PRIVATE_KEY` takes the **key file contents** (not the path). `TAURI_SIGNING_PRIVATE_KEY_PATH`, which passes a path, can trigger a password prompt depending on the environment and hang headless runs, so use content injection.

On success, the log ends with `Finished N updater signatures at:` and `.sig` files are generated.

### 4. Artifacts

```
app/src-tauri/target/release/bundle/
  nsis/MultiAgent_<ver>_x64-setup.exe        ← main installer
  nsis/MultiAgent_<ver>_x64-setup.exe.sig    ← signature (for updater)
  nsis/MultiAgentCompany_<ver>_x64-setup.exe
  nsis/MultiAgentCompany_<ver>_x64-setup.exe.sig
  msi/MultiAgent_<ver>_x64_en-US.msi
  msi/MultiAgent_<ver>_x64_en-US.msi.sig
  msi/MultiAgentCompany_<ver>_x64_en-US.msi
  msi/MultiAgentCompany_<ver>_x64_en-US.msi.sig
  latest.json
  latest-company.json
```

### 5. Writing the latest Manifest

Put the **entire contents** of the `.sig` file into `signature`.

```json
{
  "version": "0.4.5",
  "notes": "Release summary",
  "pub_date": "2026-06-13T13:30:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of the nsis setup.exe.sig file, verbatim>",
      "url": "https://github.com/OneThingChanged/Multiagent/releases/download/v<ver>/MultiAgent_<ver>_x64-setup.exe"
    }
  }
}
```

- `signature` is the contents of the NSIS **setup.exe.sig** (do not confuse with the msi one)
- `url` is that release's setup.exe download address
- `npm run release:build:all` builds both variants and writes `latest.json` and `latest-company.json` into the bundle folder as well. It fails if either signature/manifest is missing.
- To rewrite only the manifests manually: `npm run release:manifests`
### 6. Commit / Tag / Push

```bash
cd K:/AI/MultiAgent
git add -A
git commit -m "Release <ver> - <summary>"
git tag v<ver>
git push origin main
git push origin v<ver>
```

> If push fails with an SSL error (`unable to get local issuer certificate`), run once:
> `git config --global http.sslBackend schannel`

### 7. Publish the GitHub Release

Key point: **do not keep it as a draft — publish immediately + mark Latest.** (There was an incident where 0.4.4/0.4.5 stayed as drafts and the updater could not see them.)

```bash
gh release create v<ver> --title "v<ver> — <title>" --notes "..." \
  --latest \
  app/src-tauri/target/release/bundle/nsis/MultiAgent_<ver>_x64-setup.exe \
  app/src-tauri/target/release/bundle/nsis/MultiAgent_<ver>_x64-setup.exe.sig \
  app/src-tauri/target/release/bundle/nsis/MultiAgentCompany_<ver>_x64-setup.exe \
  app/src-tauri/target/release/bundle/nsis/MultiAgentCompany_<ver>_x64-setup.exe.sig \
  app/src-tauri/target/release/bundle/msi/MultiAgent_<ver>_x64_en-US.msi \
  app/src-tauri/target/release/bundle/msi/MultiAgent_<ver>_x64_en-US.msi.sig \
  app/src-tauri/target/release/bundle/msi/MultiAgentCompany_<ver>_x64_en-US.msi \
  app/src-tauri/target/release/bundle/msi/MultiAgentCompany_<ver>_x64_en-US.msi.sig \
  app/src-tauri/target/release/bundle/latest.json \
  app/src-tauri/target/release/bundle/latest-company.json
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
# Are all assets there? (standard/company setup.exe, .sig, msi, .sig, latest*.json)
gh release view v<ver> --json assets --jq '.assets[].name'
# Check the latest.json version (bypass CDN cache: version-direct URL)
curl -sL "https://github.com/OneThingChanged/Multiagent/releases/download/v<ver>/latest.json" | grep version
curl -sL "https://github.com/OneThingChanged/Multiagent/releases/download/v<ver>/latest-company.json" | grep version
```

> `/releases/latest/download/latest.json` (the path the updater reads) may serve the old version for a few minutes after publishing due to GitHub CDN caching. If the version-direct URL is correct, all is well; the cache refreshes within minutes.

## Common Pitfalls (Checklist)

- [ ] Are all 3 Tauri version sources and the Cargo.lock root version bumped?
- [ ] Did you run `npm run release:build:all` with `TAURI_SIGNING_PRIVATE_KEY` (+ empty PASSWORD)? → both variants' `.sig` generated?
- [ ] Is the `signature` in `latest.json` / `latest-company.json` the contents of each variant's **NSIS setup.exe.sig**?
- [ ] Is the release **not a draft + marked Latest**?
- [ ] Did you upload all standard/company assets (setup.exe, setup.exe.sig, msi, msi.sig, latest*.json)?
- [ ] Does `gh api .../releases/latest` point to this tag?

## Unsigned Warning

There is no code signing certificate (EV/OV), so Windows SmartScreen warns on first launch ("More info → Run anyway"). This is separate from the updater signing above (key-based integrity verification).
