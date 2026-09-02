---
type: Implementation Plan
title: Microsoft Store MSIX delivery plan
description: "Implemented Store-isolated MSIX channel and the remaining Partner Center certification and rollout gates."
tags:
  - release
  - windows
  - msix
  - microsoft-store
status: draft
sources:
  - id: desktop-manifest
    resource: ../app/package.json
    title: "Current Electron build and NSIS publication configuration"
  - id: runtime-variant
    resource: ../app/electron/runtime-variant.cjs
    title: "Standard and Company runtime identities"
  - id: electron-main
    resource: ../app/electron/main.mjs
    title: "Updater, storage, terminal, browser, and local-service runtime"
  - id: store-builder
    resource: ../app/scripts/build-electron-store.mjs
    title: "Fail-closed Store MSIX builder"
  - id: store-config
    resource: ../app/electron-builder.store.cjs
    title: "Store package contents and x64 filtering"
  - id: store-manifest
    resource: ../app/store/Package.appxmanifest.template.xml
    title: "Packaged classic app manifest"
  - id: store-verifier
    resource: ../app/scripts/verify-electron-store-msix.mjs
    title: "Store package integrity and content verifier"
  - id: electron-msix-guide
    resource: https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-packaging
    title: "Microsoft Electron MSIX packaging guide"
  - id: store-distribution
    resource: https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store
    title: "Microsoft Store Win32 distribution options"
  - id: store-policy
    resource: https://learn.microsoft.com/en-us/windows/apps/publish/store-policies
    title: "Microsoft Store policies"
  - id: store-visibility
    resource: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/visibility-options
    title: "Microsoft Store audience and discoverability options"
---

# Microsoft Store MSIX delivery plan

## Goal and current decision

Add a Store-managed Windows distribution channel for MultiAgent. Microsoft
hosts and signs the submitted MSIX, users install it from the Microsoft Store
or its web installer, and Store-managed updates replace `electron-updater` for
that build. Existing Standard and Company NSIS releases remain unchanged until
the Store path has passed private-audience testing.[^electron-msix-guide][^store-distribution]

The isolated Store variant, manifest, x64 MSIX builder, development certificate,
content verifier, packaged runtime smokes, and administrator-only WACK/install
commands are implemented. On 2026-09-02 the development package
`1.6.25.0` was built and signed, its manifest/hash/content checks passed, and
the packaged Store runtime passed bridge, Dashboard, close, workspace, and
security smokes.[^store-builder][^store-verifier]

Production packaging and certification are intentionally fail-closed until
Partner Center issues the exact product identity. The build does not accept the
development identity for upload, and this non-administrator session could not
install the development certificate into `LocalMachine\TrustedPeople` or run
WACK. Those are the two remaining local verification actions before upload.

## Account prerequisite

Complete these steps in Partner Center before the production manifest is
finalized:

1. Create the appropriate Individual or Company developer account.
2. Reserve the product name. Try `MultiAgent`, but accept a distinct Store name
   if the reservation is unavailable.
3. Record the non-secret product identity fields exactly as issued:
   `Package/Identity/Name`, `Publisher`, `PublisherDisplayName`, and Package
   Family Name.
4. Decide whether the first submission is Private audience, direct-link only,
   or publicly searchable. Start with Private audience for certification and
   migration testing.[^store-visibility]
5. Prepare the privacy-policy URL, support URL, Store description, screenshots,
   age rating answers, and tester Microsoft accounts.

Do not commit account credentials, verification documents, tokens, passwords,
or local certificate files. Store identity strings are public metadata after
publication, but this project will still load them from an ignored local
configuration file so personal or organization-specific values are not added
to Git by accident.

## Phase 1: isolated Store build — implemented

1. Add a `store` runtime/build variant alongside `standard` and `company`.
2. Add `electron:dist:store:dev` for a placeholder development identity and
   `electron:dist:store` that fails closed unless all Partner Center identity
   fields are provided.
3. Reuse the production Electron layout, then package it as an unsigned x64
   `.msix`. An unsigned production MSIX is intentional because the Store signs
   it after certification.[^electron-msix-guide]
4. Add a manifest with the exact Partner Center identity, desktop target,
   `Windows.FullTrustApplication`, and `runFullTrust`. Explain in the submission
   that MultiAgent is a local terminal and agent workspace that launches
   user-selected CLI tools and accesses user-selected project folders.
5. Keep Store-only configuration and generated packages out of the Standard and
   Company builders. Generated MSIX files remain ignored release artifacts.

## Phase 2: Store runtime behavior — implemented baseline

1. Disable GitHub `electron-updater` checks, downloads, and install controls in
   the Store variant. Display that updates are managed by Microsoft Store.
2. The Store package uses separate `userData` and LocalAppData roots. Its local
   servers already probe subsequent loopback ports when a Standard instance owns
   a default port, so state and listener ownership do not cross variants.
3. The first Store release deliberately keeps Standard data separate. Automatic
   migration is not part of the current baseline; users must validate the Store
   channel before any later opt-in import workflow is introduced.
4. Verify that external Codex and Claude processes can still read the hook/MCP
   configuration and exchange data with the full-trust packaged process.
5. Exclude the Android APK from the Store package. The Remote download surface
   should use the separately published, release-signed APK.
6. The Store variant never downloads `cloudflared.exe`. It uses an existing
   executable from the Store data directory or `PATH`, otherwise returns an
   installation instruction. Standard retains its current download behavior.
   This keeps dynamically acquired executable code out of the Store channel.
   [^store-policy][^electron-main]

## Phase 3: local package verification

1. Generate a development-only self-signed certificate outside the repository
   and create a locally signed MSIX. Installation requires an elevated shell so
   the public certificate can be added to `LocalMachine\TrustedPeople`; the
   private key remains in the creating user's certificate store.
2. Install and launch the package without uninstalling the production NSIS
   version. Do not run both variants simultaneously during port and hook tests.
3. Verify cold start, project selection, PTY creation, Codex/Claude discovery,
   hooks, cancellation, session resume, conversation history, embedded browser,
   browser MCP, Remote service, document preview, usage indexing, TTS, tray
   behavior, and clean shutdown.
4. Verify upgrade-in-place with a higher four-part MSIX version and confirm that
   app data survives the update.
5. Run the Windows App Certification Kit and inspect the packaged manifest and
   PE/native-module architecture. Remove the local test package and certificate
   after verification.

## Phase 4: Partner Center submission

1. Rebuild the unsigned MSIX with the exact reserved identity and release
   version; never upload the placeholder development identity.
2. Upload the MSIX and complete the listing, privacy, support, capability
   justification, and certification notes.
3. Publish to Private audience first. Give testers the authenticated Store link
   and collect installation, startup, Remote, and update results.
4. Address certification findings in the Store variant without weakening the
   security or behavior of the existing NSIS variants.
5. After acceptance, choose either public search or direct-link-only
   availability. A public audience cannot later be changed back to Private
   audience.[^store-visibility]

## Phase 5: release integration

1. Add the Microsoft Store badge or Web Installer action to the Remote download
   page. The website must point to the Store acquisition path, not directly to
   an unsigned MSIX.
2. Keep Store and NSIS update channels explicit: Store packages update through
   Windows; NSIS packages continue to use their GitHub manifests.
3. Decide after a stable Store release whether new public users should receive
   only the Store build while NSIS remains a developer, Company, or recovery
   channel.
4. Update the release playbook, development guide, known limitations, and
   public README only after the Store artifact and certification path exist.

## Acceptance criteria

The Store path is ready when all of the following are true:

* a tester can acquire MultiAgent through Microsoft Store without an unknown
  publisher or SmartScreen download warning;
* Microsoft Store can install an update without invoking `electron-updater`;
* existing NSIS data is migrated or deliberately kept separate without session
  or conversation mixing;
* terminal, hook, browser MCP, Remote, and document workflows pass in the
  installed MSIX;
* Store and NSIS instances cannot corrupt shared state or compete for the same
  ports;
* no account credential, certificate private key, verification document,
  personal address, or secret Store configuration is tracked by Git; and
* the Windows App Certification Kit and Partner Center certification both pass.

## Production handoff checklist

1. Reserve the product in Partner Center and copy
   `Package/Identity/Name`, `Publisher`, `PublisherDisplayName`, and the Store
   product ID into ignored `app/store/store-identity.local.json` using
   `app/store/store-identity.example.json` as the template.
2. In an administrator PowerShell, run `npm run electron:install:store:dev` and
   `npm run electron:wack:store:dev` from `app/`.
3. Run `npm run electron:dist:store`; it produces the unsigned, exact-identity
   MSIX that Partner Center will sign after certification.
4. Upload through a Private audience submission first and provide the
   `runFullTrust` justification: MultiAgent is a local terminal/agent workspace
   that launches user-selected CLI tools and reads user-selected project paths.

Do not use the NSIS installer-submission route for this goal: it still requires
a publicly trusted code-signing certificate, while the MSIX route receives
complimentary Store signing.

[^desktop-manifest]: Current Electron build and NSIS publication configuration
[^runtime-variant]: Standard and Company runtime identities
[^electron-main]: Updater, storage, terminal, browser, and local-service runtime
[^store-builder]: Fail-closed Store MSIX builder
[^store-config]: Store package contents and x64 filtering
[^store-manifest]: Packaged classic app manifest
[^store-verifier]: Store package integrity and content verifier
[^electron-msix-guide]: Microsoft Electron MSIX packaging guide
[^store-distribution]: Microsoft Store Win32 distribution options
[^store-policy]: Microsoft Store policies
[^store-visibility]: Microsoft Store audience and discoverability options
