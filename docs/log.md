# OKF Update Log

## 2026-09-02

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
