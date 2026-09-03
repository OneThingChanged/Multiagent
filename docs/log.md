# OKF Update Log

## 2026-09-03

* **Release 0.6.27**: Synchronized the desktop and Android release versions for the state-aware embedded-browser form automation release.
* **Microsoft Store certification submission**: Recorded the validated `1.6.26.0` private-audience MSIX, completed Partner Center sections, `runFullTrust` rationale, in-certification status, and pass/failure follow-up checklists.
* **State-aware browser form automation**: Added semantic form snapshots, stable targeting, idempotent checkbox/radio/select operations, bounded postcondition waits, framework-compatible events, double-layer value redaction, and a real Electron fixture smoke.
* **Stable embedded browser lifetime**: Moved native `WebContentsView` destruction from transient React component unmounts to explicit browser-tab closure, preventing pane moves and layout reconciliation from leaving a visible but blank browser tab.

## 2026-09-02

* **Microsoft Store MSIX implementation**: Added an isolated Store runtime, exact-identity manifest rendering, fail-closed unsigned production packaging, local development signing, content/hash verification, packaged smokes, and administrator-only install/WACK entry points.
* **Store supply-chain boundary**: Excluded APKs, credential-like files, non-x64 node-pty payloads, and debug symbols from Store output; disabled Store runtime downloads of `cloudflared` while preserving PATH-based use.
* **Acknowledged web session creation**: Remote and local Dashboard creation now waits for coordinator validation, agent ownership, and actual insertion before returning success; disabled tools are synchronized into both web surfaces and failures remain actionable in the editor.
* **Remote conversation UX prototype**: Added single, split, and long-result review states with immediate result visibility, collapsible work logs, a tabbed right sidebar whose session status follows the active pane, non-disruptive event badges, and a mobile overlay drawer.
* **Reliable image-tagged Remote submission**: Wrapped multiline Remote messages in terminal bracketed-paste markers before sending a discrete Enter, preventing image paths from remaining unsubmitted in Codex or Claude prompts.
* **Remote UX reliability**: Isolated drafts and queues per session, added atomic same-origin message submission with failure recovery, enabled durable paged chat restoration, opened HTML hyperlinks directly, stabilized session navigation, paused hidden Android profile streams, and added managed Back routing.
* **Microsoft Store MSIX plan**: Recorded the deferred Partner Center prerequisites, isolated Store build, runtime migration, certification, security, and rollout gates without changing production packaging.
* **Readable chat timeline**: Documented provider-labelled assistant cards, transcript-ordered tool groups, richer Markdown hierarchy, and explicit latest-message navigation.
* **Tabbed session properties**: Documented separate basic-information, session-data, and launch-option panels with bounded independent scrolling.

## 2026-09-01

* **Persistent conversation store**: Documented session-isolated SQLite chat restoration, incremental transcript indexing, paged history, referenced artifacts, and verified configurable storage migration.
* **Session deletion input recovery**: Documented synchronous context-backdrop cleanup, atomic layout reference updates, and surviving-terminal focus restoration after confirmed or cancelled deletion.

## 2026-08-31

* **Electron-only runtime**: Removed the retired desktop host, its build dependencies, updater-transition signatures, manifests, storage command aliases, and renderer fallbacks.
* **Release simplification**: Defined Standard and Company Electron NSIS/YAML artifacts plus the signed Android APK as the complete release set.
* **Signing status clarification**: Recorded that Windows installers currently rely on updater SHA-512 integrity and are not Authenticode-signed; Android remains release-signed.

## 2026-08-30

* **Session JSONL catalog**: Documented project-scoped Codex/Claude transcript ownership, grouped storage totals, current-session properties, and metadata-only persistence.
* **Safe transcript deletion**: Recorded live-session protection and Recycle Bin deletion with post-delete catalog cleanup.
* **Native browser occlusion**: Recorded that React image overlays temporarily hide Electron browser views and resist delayed bounds updates before restoring the active tab.

## 2026-08-27

* **APK profile view sessions**: Recorded lazy per-PC WebView retention across Session Hub and profile switches, with deletion as the explicit teardown boundary.
* **Android Back order**: Defined active WebView history as the first destination and the native combined Session Hub as the fallback instead of exiting the app or expanding the toolbar.

## 2026-08-26

* **Visible browser automation**: Added a `+` control to every pane for opening Google in an embedded tab and made session-owned MCP browser actions reveal the affected tab while preserving its split placement.
* **Browser tab lifecycle**: Recorded that inactive native browser views remain alive but hidden, and ephemeral browser tabs are discarded during workspace restoration.
* **Remote focus boundary**: Clarified that Remote browser control updates the shared browser without stealing the desktop operator's current tab or focus.

## 2026-08-24

* **Remote shared browser**: Added an approved-session, same-origin-controlled browser relay with shared tab IDs, memory-only JPEG frames, scaled touch input, navigation, and explicit mobile text/key controls for desktop-local sites.
* **Remote HTML compatibility**: Rebound root-relative assets to the preview capability and added a dependency-free `index.json` renderer for Unreal Automation reports that omit their Bower runtime.
* **Browser startup ordering**: Recorded that the hidden shared browser profile and authenticated loopback broker start before restored AI sessions.
* **Codex MCP environment**: Documented the explicit stdio environment-variable allowlist that prevents the managed browser MCP from exiting before `initialize`.

## 2026-08-23

* **In-place conversion**: Converted the existing `docs/` tree into the canonical OKF v0.2 bundle instead of maintaining a duplicate `okf/` directory.
* **Deduplication**: Assigned one durable concept to each existing document and replaced repeated implementation, security, build, and lifecycle explanations with cross-links.
* **Source reconciliation**: Updated current-runtime claims to the production Electron sources.
* **Normalization**: Renamed concepts to lowercase kebab-case, redirected repository documentation links to `docs/index.md`, and removed the duplicate `docs/README.md` map.
