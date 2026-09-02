---
type: Playbook
title: Development and build
description: "Local development, verification, desktop packaging, and Android build entry points."
tags:
  - build
  - development
  - electron
  - android
status: stable
stale_after: 2026-11-30
sources:
  - id: desktop-manifest
    resource: ../app/package.json
    title: "Desktop scripts and Electron Builder configuration"
  - id: dev-runner
    resource: ../app/scripts/electron-dev.mjs
    title: "Electron development runner"
  - id: standard-builder
    resource: ../app/scripts/build-electron-standard.mjs
    title: "Standard desktop build"
  - id: company-builder
    resource: ../app/scripts/build-electron-company.mjs
    title: "Company desktop build"
  - id: store-builder
    resource: ../app/scripts/build-electron-store.mjs
    title: "Microsoft Store MSIX build"
  - id: store-verifier
    resource: ../app/scripts/verify-electron-store-msix.mjs
    title: "Microsoft Store MSIX verifier"
  - id: mobile-manifest
    resource: ../mobile/package.json
    title: "Android scripts"
  - id: mobile-builder
    resource: ../mobile/scripts/build-apk.mjs
    title: "Android APK build and verification"
---

# Development and build

## Requirements

Use a supported Node.js/npm installation on Windows. Native `node-pty`
installation or rebuild may also require the normal Windows C++ build-tool
chain. Release APK signing requires a local keystore and passwords outside the
repository.[^desktop-manifest][^mobile-builder]

Install each package independently:

```powershell
cd "K:\AI\MultiAgent\app"
npm install

cd "K:\AI\MultiAgent\mobile"
npm install
```

## Desktop development

```powershell
cd "K:\AI\MultiAgent\app"
npm run electron:dev
```

The development runner starts Vite on port `4420` and the Electron host. It
should reuse/clean its own child processes rather than requiring a second Vite
instance.[^dev-runner]

Renderer-only preview is available with `npm run dev`, but it cannot validate
PTY, preload, native browser, tray, updater, or packaged-resource behavior.

## Verification

Run checks in proportion to the change:

```powershell
cd "K:\AI\MultiAgent\app"
npm test
npm run build
npm run electron:smoke
```

Lifecycle, single-instance, bridge, and packaged smokes have dedicated package
scripts. A release candidate should run the packaged Standard and Company smoke
paths documented in [Release playbook](release-playbook.md).[^desktop-manifest]

## Desktop packaging

```powershell
cd "K:\AI\MultiAgent\app"
npm run electron:dist          # Standard NSIS
npm run electron:dist:company  # Company NSIS
npm run electron:dist:all      # Standard then Company
npm run electron:dist:store:dev # Locally signed development MSIX
```

Standard and Company use NSIS; Microsoft Store uses an isolated x64 MSIX.
Portable executables are not built.
The Standard build fails closed unless it verifies the configured release APK,
package name, architecture, hash, and signing certificate. The Company build
uses a distinct identity and excludes the APK.[^standard-builder][^company-builder]

Build output is under `app/electron-dist/`. It is generated material and must
not be treated as source documentation.

### Microsoft Store package

The development path uses a placeholder identity and a self-signed certificate
whose private key stays in `Cert:\CurrentUser\My`:

```powershell
cd "K:\AI\MultiAgent\app"
npm run electron:dist:store:dev
npm run electron:verify:store:dev
npm run electron:store-packaged-smoke
npm run electron:store-packaged-lifecycle-smoke
```

Installing that development package and running WACK require an administrator
PowerShell because Windows must trust the public development certificate at the
machine level:

```powershell
npm run electron:install:store:dev
npm run electron:wack:store:dev
```

Production builds require the exact Partner Center fields in ignored
`app/store/store-identity.local.json`. `npm run electron:dist:store` fails before
building when the file is absent or invalid. The production MSIX remains
unsigned for Partner Center to sign; it never contains the Android APK, signing
keys, or Store credentials.[^store-builder][^store-verifier]

## Android APK

```powershell
cd "K:\AI\MultiAgent\mobile"
npm run typecheck
npm test
npm run apk
```

`npm run signing:setup` creates the local release keystore only when initially
provisioning a build PC. Back up the keystore and password separately. Never
commit `.env`, keystores, passwords, or local signing metadata.[^mobile-manifest][^mobile-builder]

The Android package is a Remote client, not a replacement desktop runtime. Its
profile/authentication model is documented in [Remote service](remote-service.md).

[^desktop-manifest]: Desktop scripts and Electron Builder configuration
[^dev-runner]: Electron development runner
[^standard-builder]: Standard desktop build
[^company-builder]: Company desktop build
[^store-builder]: Microsoft Store MSIX build
[^store-verifier]: Microsoft Store MSIX verifier
[^mobile-manifest]: Android scripts
[^mobile-builder]: Android APK build and verification
