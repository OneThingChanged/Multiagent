---
type: Implementation Plan
title: Microsoft Store MSIX delivery and certification record
description: "Implemented and submitted MultiAgent's private-audience MSIX package; Partner Center certification is in progress as of 2026-09-03."
tags:
  - release
  - windows
  - msix
  - microsoft-store
status: draft
last_updated: 2026-09-04
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
  - id: capability-declarations
    resource: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations
    title: "Microsoft app capability declarations"
  - id: submission-options
    resource: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/manage-submission-options
    title: "Microsoft Store submission options"
  - id: action-center
    resource: https://learn.microsoft.com/en-us/partner-center/action-center/action-center-overview
    title: "Microsoft Partner Center Action Center"
  - id: store-package-updates
    resource: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/package-updates-from-store
    title: "Download and install package updates from the Store"
  - id: msix-package-updates
    resource: https://learn.microsoft.com/en-us/windows/msix/app-package-updates
    title: "MSIX app package update behavior"
---

# Microsoft Store MSIX delivery and certification record

## Goal and release decision

MultiAgent has a Store-managed Windows distribution channel in addition to the
existing Standard and Company NSIS releases. Microsoft will sign and deliver
the submitted MSIX after certification; Store-managed updates are separate
from `electron-updater`. The first Store release is restricted to a private
audience so installation and migration behavior can be validated before any
public rollout.[^electron-msix-guide][^store-distribution][^store-visibility]

The Store build keeps its data and update channel separate from NSIS. Existing
NSIS releases remain available until the Store channel has passed private-user
testing and a deliberate public rollout decision is made.

A request to deploy live covers GitHub only. Store packaging and Partner Center
submission require a separate explicit request, and a later Store submission
for the same product release retains the exact GitHub four-part version.

## Submission status — 2026-09-03

| Item | Current value |
| --- | --- |
| Store product | MultiAgent |
| Store product ID | `9NVBSGNRTPLR` |
| Submitted package | `app/electron-dist/store/MultiAgent-Store-Release-1.6.26.0-x64.msix` |
| Package version / architecture | `1.6.26.0` / `x64` |
| Package size | Approximately 150.3 MiB |
| Windows App Certification Kit | Passed |
| Partner Center package validation | Passed |
| Audience | Private audience |
| Submission | `In certification` |
| Progress | Submission and Pre-processing complete; Certification pending |
| Publishing behavior | Automatic after certification passes, limited to the configured private audience |

The package was uploaded to the first Partner Center submission after the
product identity, listing, privacy, age-rating, package, and capability fields
were prepared. Do not cancel the certification while this status is pending.

## Completed implementation and Partner Center work

### Store build and runtime

The following implementation work is complete:

1. A `store` runtime/build variant exists alongside `standard` and `company`.
2. `electron:dist:store:dev` supports a development identity, while the
   production Store build fails closed unless the Partner Center identity is
   supplied.
3. The Store package is x64-only and excludes the Android APK.
4. The Store variant uses separate `userData` and LocalAppData roots and does
   not use the GitHub `electron-updater` channel. Store updates are managed by
   Windows.
5. The package keeps the existing terminal/PTY, hooks, Git, browser, Remote,
   document, session, and project workflows needed by the desktop app.
6. The Store variant does not download `cloudflared.exe`; it uses an existing
   executable from the Store data directory or `PATH`, with an installation
   instruction when none is available.
7. Store-only identity configuration and generated packages remain excluded
   from Git. No credentials, verification documents, tokens, passwords, or
   private certificate keys are tracked.

The local development package and release package were checked with the Store
builder/verifier, and the submitted release artifact passed WACK and Partner
Center package validation.[^store-builder][^store-verifier]

### Partner Center sections completed

The first private-audience submission has these sections marked complete:

- Pricing and availability — free product, private audience.
- Properties — Developer tools / Utilities, privacy policy, website/support
  links, and the applicable generative-AI declaration.
- Age ratings — questionnaire completed.
- Packages — the `1.6.26.0` x64 MSIX validated.
- Store listings — Korean and English listings completed, with the Store
  screenshot uploaded for each listing.
- Submission options — certification notes, automatic publishing choice, and
  the restricted-capability justification entered.

The Store listing screenshot is retained at:

`app/store/listing/screenshots/multiagent-store-primary.png`

The listing asset is a 1672×941 PNG and is within the Store screenshot size
limit. Store-logo assets are included in the package; optional Store poster and
box-art uploads are not required for the current submission.

The certification notes explain that the core local workspace, project,
session, terminal, file, Git, browser, and process features do not require
credentials. Optional Remote sign-in is not required for certification of the
core application.

## `runFullTrust` capability decision

`runFullTrust` is the sole restricted capability in the Store manifest:

```xml
<rescap:Capability Name="runFullTrust" />
```

The application is declared as a packaged classic Electron app with
`uap10:RuntimeBehavior="packagedClassicApp"` and
`uap10:TrustLevel="mediumIL"`. This capability is required for MultiAgent to
launch user-selected Win32 command-line tools, terminal/PTY child processes,
Git commands, and development utilities; exchange standard input/output;
monitor processes and local ports; and access files in project folders selected
by the user.[^capability-declarations]

`runFullTrust` does not mean administrator elevation. The package does not
declare `allowElevation`, does not request administrator approval, and does not
install drivers or Windows services. The explanation above was entered in
Partner Center's restricted-capability justification field for certification
review.[^submission-options]

The amber package-acceptance message about `runFullTrust` is a review notice,
not a certification rejection. Removing this capability would break the
desktop process and terminal model, so it should remain unless Microsoft
specifically rejects the workflow and provides an alternative requirement.

## Submission options and transient `Incomplete` behavior

During preparation, Partner Center briefly continued to display
`Submission options: Incomplete` even though the publishing choice and
`runFullTrust` explanation were visible and had been saved. The exact backend
cause was not established, so this document does not attribute it to a specific
account or browser defect. The submission subsequently entered `In
certification`, which confirms that the required pre-submission gate was
accepted for this package.

Use the following distinction when reviewing future submissions:

- An amber restricted-capability warning means that Microsoft will review the
  declared capability and its explanation.
- A red validation error, duplicate package error, missing required field, or
  failed package validation is an actual submission blocker.
- A stale `Incomplete` badge should be reloaded and rechecked after saving. If
  the submission still refuses to start, capture the page and contact Partner
  Center support rather than removing a capability that the app needs.

If the status becomes inconsistent again, check the following in order:

1. Open the submission options page, confirm the justification text and
   publishing choice, save at the bottom, and wait for the overview to refresh.
2. Refresh the Partner Center session and inspect the submission's validation
   details and Action Center notifications.
3. In Action Center, open **My preferences** and confirm that the account's
   notification email is present and verified. This is a troubleshooting check,
   not a confirmed explanation for the earlier badge behavior.[^action-center]
4. If the problem persists, open Partner Center support and provide the Store
   product ID, submission ID, package filename/version, visible validation
   message, and a screenshot. Never include passwords, tokens, private keys, or
   account recovery information.

## Follow-up checklist

### While certification is pending

- Monitor the Partner Center status and the verified notification email.
- Keep the submitted package and its source commit unchanged for traceability.
- Do not cancel certification or replace the package unless Partner Center
  reports a concrete error or requests a new submission.

### If certification passes

1. Confirm that the submission advances to Publishing and that the product is
   still restricted to the intended private audience.
2. Acquire the restricted Store link with an authorized test account and test
   install, first launch, project selection, session creation/resume,
   conversation history, terminal/PTY, hooks, Git, browser MCP, Remote,
   document preview, TTS, usage indexing, update, and clean shutdown.
3. Verify that Store updates replace the package without invoking
   `electron-updater`, and verify that NSIS and Store data remain separated.
4. Save the certification result and private-test findings in the release
   record before changing the public website or download instructions.

### If certification fails or Microsoft requests information

1. Read the certification report and identify the exact failing test, package
   rule, or missing reviewer information.
2. Supply the requested explanation through Partner Center, or make a focused
   Store-variant fix. Keep the `runFullTrust` rationale aligned with the actual
   user-initiated terminal and project workflows.
3. Rebuild with a higher four-part version, rerun the verifier and WACK, and
   upload the replacement package to a new submission.
4. Do not weaken the Standard/Company channels or remove required capabilities
   without a concrete Microsoft requirement.

### Before a public rollout

- The certified private-audience package has been installed successfully on a
  supported Windows desktop system. Complete one higher-version Store update
  test before public rollout.
- The Store update-control UX is decided below. Public rollout must not proceed
  while the remaining versioning, sequencing, and policy tests are unresolved.
- Decide between public discoverability and direct-link-only acquisition, then
  update Pricing and availability accordingly. A public-audience decision
  should be treated as a deliberate rollout gate, not a certification step.
- Update the Remote download page to point users to the Store acquisition path;
  do not distribute an unsigned MSIX directly.
- Keep the Store and NSIS update channels clearly labeled and retain NSIS as a
  developer, Company, or recovery channel if that remains useful.
- Update the public README, release playbook, known limitations, and support
  instructions only after the private test is successful.

## Public rollout decision gate — Store updates

The Store build already rejects the GitHub `electron-updater` workflow and
declares Microsoft Store as its update provider. That implementation boundary
must remain: a Store-installed MSIX is updated by Windows/Microsoft Store,
whereas Standard and Company NSIS installations continue to use their existing
GitHub updater channels.[^runtime-variant][^electron-main][^store-distribution]

The update-channel boundary is now fixed. The remaining items must be completed
before making the Store listing public:

1. **Update control UX — decided:** Store builds replace GitHub update controls
   with a Microsoft Store-managed status and a dedicated button that opens the
   product page for Store product `9NVBSGNRTPLR`. Standard/Company builds retain
   their GitHub check, install, and release controls.
2. **Optional in-app Store check:** decide whether ordinary Store background
   updates are sufficient or whether a later native bridge should use the
   Windows Store package-update APIs to check and request installation from
   inside MultiAgent.[^store-package-updates]
3. **Version mapping:** keep the four-part MSIX package version strictly higher
   for every Partner Center submission and record its mapping to the product
   version. The unified baseline uses desktop compatibility version `1.7.0`
   and the identical public/Store version `1.7.0.0`. This is higher than the
   existing `1.6.26.0` Store package and can use the current product identity.
   Every later Store submission uses the exact version of its corresponding
   GitHub product release rather than creating a Store-only version number.
4. **Channel coexistence:** decide whether NSIS remains a developer, Company,
   or recovery channel, how the website labels each installer, and whether
   simultaneous NSIS and Store installations are supported. Preserve the
   intentionally separate updater and data identities unless an explicit,
   tested migration is implemented.
5. **Update policy edge cases:** test private-audience upgrades when Store
   automatic updates are enabled, disabled by the user, restricted by
   organization policy, delayed, offline, or interrupted. Verify that the app
   remains usable and presents an actionable version/update status.
6. **Release sequencing:** define when a GitHub release and its corresponding
   Store submission are considered equivalent, how certification delay is
   communicated, and which channel receives urgent fixes first. Do not promise
   simultaneous availability when Partner Center certification is still
   pending.
7. **Private upgrade evidence:** install the certified private package, submit
   one higher-version private update, and confirm that Windows replaces the
   package without invoking `electron-updater`, losing Store data, or breaking
   terminal, browser, Remote, and session workflows. MSIX update delivery may
   use block-level differential transfer, so verify behavior rather than
   assuming a full reinstall.[^msix-package-updates]

The initial public Store rollout remains blocked until these decisions and the
private higher-version upgrade test are recorded in this document.

## Release gates

### Complete

- Isolated Store runtime and x64 MSIX builder.
- Partner Center product identity and private-audience submission.
- WACK and Partner Center package validation.
- Pricing, properties, age ratings, package, and Korean/English listing data.
- Store screenshot and package logo assets.
- `runFullTrust` justification and certification notes.
- Microsoft Store certification and private-audience publication.
- Private-audience installation of Store package `1.6.26.0`.
- Store-specific update status and product-page action, isolated from the
  GitHub updater controls.

### Pending

- Private-audience higher-version update validation.
- Final version mapping, channel-coexistence, release-sequencing, and
  policy-edge-case decisions.
- One successful private-audience higher-version Store upgrade.
- Public discoverability/direct-link decision and public rollout documentation.

The Store path is not considered a general-public release until the pending
gates above are complete. The existing NSIS release remains the fallback during
certification and private testing.

[^desktop-manifest]: Current Electron build and NSIS publication configuration
[^runtime-variant]: Standard and Company runtime identities
[^electron-main]: Updater, storage, terminal, browser, and local-service runtime
[^store-builder]: Fail-closed Store MSIX builder
[^store-config]: Store package contents and x64 filtering
[^store-manifest]: Packaged classic app manifest
[^store-verifier]: Store package integrity and content verifier
[^electron-msix-guide]: [Microsoft Electron MSIX packaging guide](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/guides/electron-packaging)
[^store-distribution]: [Microsoft Store Win32 distribution options](https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store)
[^store-policy]: [Microsoft Store policies](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies)
[^store-visibility]: [Microsoft Store audience and discoverability options](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/visibility-options)
[^capability-declarations]: [Microsoft app capability declarations](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)
[^submission-options]: [Microsoft Store submission options](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/manage-submission-options)
[^action-center]: [Microsoft Partner Center Action Center](https://learn.microsoft.com/en-us/partner-center/action-center/action-center-overview)
[^store-package-updates]: [Microsoft Store package update APIs](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/package-updates-from-store)
[^msix-package-updates]: [MSIX app package update behavior](https://learn.microsoft.com/en-us/windows/msix/app-package-updates)
