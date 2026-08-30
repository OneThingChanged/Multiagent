---
type: Playbook
title: Release playbook
description: "Signing, verification, publication, and updater invariants for Standard, Company, and Android artifacts."
tags:
  - release
  - signing
  - updater
status: stable
stale_after: 2026-10-31
sources:
  - id: desktop-manifest
    resource: ../app/package.json
    title: "Desktop version, scripts, and publish configuration"
  - id: standard-config
    resource: ../app/electron-builder.standard.cjs
    title: "Standard package configuration"
  - id: company-config
    resource: ../app/electron-builder.company.cjs
    title: "Company package configuration"
  - id: standard-builder
    resource: ../app/scripts/build-electron-standard.mjs
    title: "Standard build and APK verification"
  - id: mobile-builder
    resource: ../mobile/scripts/build-apk.mjs
    title: "Signed Android build"
---

# Release playbook

This playbook defines release invariants. Build mechanics that do not involve
publication belong in [Development and build](development-and-build.md).

## Artifact model

A complete stable release contains:

* Standard Windows x64 NSIS installer, blockmap, and `latest.yml`;
* Company Windows x64 NSIS installer, blockmap, and its updater manifest;
* signed Android APK plus non-secret verification metadata for Standard.[^desktop-manifest][^standard-config][^company-config]

Portable executables are intentionally excluded.

## Secrets and signing

Android keystores and passwords live outside Git. Public certificate
fingerprints and artifact hashes may be published; private keys and
credential-bearing `.env` files may not.

The current Windows pipeline does not configure a trusted Authenticode
certificate. Electron Updater verifies each installer against the SHA-512 value
in its YAML manifest, but Windows may still show an unknown-publisher warning.
Do not describe a Windows artifact as code-signed unless
`Get-AuthenticodeSignature` independently reports `Valid`.

The Standard desktop build verifies the Android package name, version,
architectures, APK hash, and certificate fingerprint before copying it into the
release staging directory. Verification failure stops the build.[^standard-builder]

## Release procedure

1. Choose one stable `X.Y.Z` version and synchronize the desktop/mobile version
   fields and any public release metadata that intentionally tracks it.
2. Run source checks:

   ```powershell
   cd "K:\AI\MultiAgent\app"
   npm test
   npm run build
   npm run electron:smoke
   ```

3. Build and verify the signed Android APK from `mobile/`; confirm its package,
   version, architectures, hash, and certificate before desktop packaging.[^mobile-builder]
4. Build both installers:

   ```powershell
   cd "K:\AI\MultiAgent\app"
   npm run electron:dist:all
   ```

5. Run packaged verification:

   ```powershell
   npm run electron:packaged-smoke
   npm run electron:company-packaged-smoke
   npm run electron:packaged-lifecycle-smoke
   npm run electron:company-packaged-lifecycle-smoke
   ```

   Record Windows signature status explicitly:

   ```powershell
   Get-AuthenticodeSignature .\electron-dist\MultiAgent-Setup-X.Y.Z-x64.exe
   Get-AuthenticodeSignature .\electron-dist\company\MultiAgentCompany-Setup-X.Y.Z-x64.exe
   ```

6. Inspect `app/electron-dist/` and the Company/mobile subdirectories. Reject
   stale files from another version before uploading.
7. Commit the source/version change, create tag `vX.Y.Z`, push the branch and
   tag, then publish the GitHub release as Latest with the complete artifact set.
8. Download the published artifacts through their public URLs and verify hashes,
   signatures, manifests, installer version, updater visibility, and APK download.

## Updater rules

Electron Updater consumes the YAML manifests and blockmaps produced for each
variant. Standard and Company identities/channels must never cross.

Do not publish a manifest before its binary exists at the referenced URL. Do
not mark a partial release Latest. A release is complete only after installation
and update paths have been checked from published assets, not just local output.

[^desktop-manifest]: Desktop version, scripts, and publish configuration
[^standard-config]: Standard package configuration
[^company-config]: Company package configuration
[^standard-builder]: Standard build and APK verification
[^mobile-builder]: Signed Android build
