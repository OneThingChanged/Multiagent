---
type: Implementation Plan
title: Microsoft Store MSIX delivery plan
description: "Deferred plan for adding a Store-signed MSIX channel without disturbing the existing NSIS and Android releases."
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

This work is intentionally deferred until a Microsoft Store developer account
exists and Partner Center has issued the product identity. No Store build code
or manifest has been added yet.

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

## Phase 1: isolated Store build

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

## Phase 2: Store runtime behavior

1. Disable GitHub `electron-updater` checks, downloads, and install controls in
   the Store variant. Display that updates are managed by Microsoft Store.
2. Give the Store package an explicit runtime identity and prevent it from
   running concurrently with an NSIS instance that owns the same hook files,
   browser broker, or local ports.
3. On first Store launch, detect the existing Standard data directory, present
   a migration action, and copy only supported settings, projects, session
   catalog metadata, and conversation-store configuration. Preserve the source
   until the user confirms the Store version works.
4. Verify that external Codex and Claude processes can still read the hook/MCP
   configuration and exchange data with the full-trust packaged process.
5. Exclude the Android APK from the Store package. The Remote download surface
   should use the separately published, release-signed APK.
6. Replace the runtime download-and-execute behavior for `cloudflared.exe` in
   the Store variant with a reviewable strategy: either bundle a pinned,
   license-compliant, hash-verified binary or require a separately installed
   executable. Do not silently execute an unpinned latest binary in the Store
   build.[^store-policy][^electron-main]

## Phase 3: local package verification

1. Generate a development-only self-signed certificate outside the repository,
   create a locally signed MSIX, and trust it only for the current test user.
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

## Resume checklist

When the account is ready, resume from this document and provide or place the
four non-secret Partner Center identity values in the agreed ignored local
configuration file. Reconfirm the selected audience and the `cloudflared`
packaging decision, then begin Phase 1. Do not start from the existing NSIS
installer-submission route: that route still requires a publicly trusted code
signing certificate, while the MSIX route receives complimentary Store signing.

[^desktop-manifest]: Current Electron build and NSIS publication configuration
[^runtime-variant]: Standard and Company runtime identities
[^electron-main]: Updater, storage, terminal, browser, and local-service runtime
[^electron-msix-guide]: Microsoft Electron MSIX packaging guide
[^store-distribution]: Microsoft Store Win32 distribution options
[^store-policy]: Microsoft Store policies
[^store-visibility]: Microsoft Store audience and discoverability options
