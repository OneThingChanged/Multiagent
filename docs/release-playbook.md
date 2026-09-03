---
type: Playbook
title: Release playbook
description: "Signing, verification, publication, and updater invariants for Standard, Company, Store, and Android artifacts."
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
  - id: store-config
    resource: ../app/electron-builder.store.cjs
    title: "Microsoft Store package configuration"
  - id: store-builder
    resource: ../app/scripts/build-electron-store.mjs
    title: "Microsoft Store MSIX build"
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
* signed Android APK plus non-secret verification metadata for Standard; and
* after Partner Center enrollment, a separately certified Store x64 MSIX whose
  acquisition and updates are managed by Microsoft Store.[^desktop-manifest][^standard-config][^company-config][^store-config]

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

That limitation applies to the direct NSIS channels. The Store upload MSIX is
intentionally unsigned and receives Microsoft's signature after certification.
Never publish or upload the locally signed development MSIX.

The Standard desktop build verifies the Android package name, version,
architectures, APK hash, and certificate fingerprint before copying it into the
release staging directory. Verification failure stops the build.[^standard-builder]

## Release request scope

In this project, a request to **deploy live** means the Git repository and
GitHub Release channel only. It does not authorize a Store MSIX build,
verification, Partner Center upload, or certification submission. Microsoft
Store delivery starts only after a separate, explicit Store deployment request.

GitHub and Microsoft Store releases that represent the same product release use
the same four-part `X.Y.Z.0` version. Certification delay may separate their
publication dates, but it must not produce a different Store version for the
same release.

## GitHub release procedure

1. Choose one stable four-part `X.Y.Z.0` product version and synchronize the
   desktop/mobile version fields and public release metadata. npm and Electron
   Updater use the derived `X.Y.Z` compatibility value, while the app UI,
   installer filename, GitHub tag, Android `versionName`, and MSIX use the exact
   four-part value. The Standard builder rejects a signed APK whose
   `versionName` differs from the product version.
2. Run source checks:

   ```powershell
   cd "K:\AI\MultiAgent\app"
   npm test
   npm run build
   npm run electron:smoke
   ```

3. Build and verify the signed Android APK from `mobile/`; confirm its package,
   version, architectures, hash, and certificate before desktop packaging. The
   APK builder synchronizes the ignored native Gradle version fields from the
   tracked `mobile/app.json` release metadata before compiling.[^mobile-builder]
4. Build the GitHub release artifacts. This command builds the Standard channel;
   Company remains available through its existing explicit build command:

   ```powershell
   cd "K:\AI\MultiAgent\app"
   npm run release:build:github
   npm run electron:dist:company
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
7. Commit the source/version change, create tag `vX.Y.Z.0`, push the branch and
   tag, then publish the GitHub release as Latest with the complete artifact set.
8. Download the published artifacts through their public URLs and verify hashes,
   signatures, manifests, installer version, updater visibility, and APK download.

## Microsoft Store release procedure

The Store channel is built and submitted separately from GitHub releases. A
Store release never produces or consumes GitHub updater manifests.

The `1.7.0.0` baseline is higher than the already published `1.6.26.0` package.
For subsequent Store updates, use the exact four-part product version already
chosen for the corresponding GitHub release.

1. Confirm that the corresponding GitHub product version is higher than the
   package already in Partner Center, then retain that exact four-part version.
2. Build and verify the production MSIX:

   ```powershell
   cd "K:\AI\MultiAgent\app"
   npm run release:build:store
   npm run release:verify:store
   ```

3. Run WACK against the generated production package and retain its report.
4. Start a Partner Center update submission, upload only the verified MSIX, and
   submit it for certification.
5. After publication, install the private-audience update through Microsoft
   Store and verify version, retained data, terminal/browser/Remote behavior,
   and that the GitHub updater was never invoked.

## Updater rules

Electron Updater consumes the YAML manifests and blockmaps produced for each
variant. Standard and Company identities/channels must never cross.
The generated updater YAML intentionally carries the derived three-part semver
(`1.7.1` for product `1.7.1.0`) because Electron Updater rejects four-part
versions. The GitHub release tag, artifact name, app UI, and release metadata
remain `1.7.1.0`.

The Store variant disables Electron Updater and delegates acquisition and
updates to Microsoft Store. It uses a separate data identity and must be built
from the exact Partner Center identity file. Its settings page opens the Store
product page for manual checks while Windows continues to manage delivery.[^store-builder]

Do not publish a manifest before its binary exists at the referenced URL. Do
not mark a partial release Latest. A release is complete only after installation
and update paths have been checked from published assets, not just local output.

[^desktop-manifest]: Desktop version, scripts, and publish configuration
[^standard-config]: Standard package configuration
[^company-config]: Company package configuration
[^store-config]: Microsoft Store package configuration
[^store-builder]: Microsoft Store MSIX build
[^standard-builder]: Standard build and APK verification
[^mobile-builder]: Signed Android build
