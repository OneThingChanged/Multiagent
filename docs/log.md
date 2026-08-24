# OKF Update Log

## 2026-08-24

* **Browser startup ordering**: Recorded that the hidden shared browser profile and authenticated loopback broker start before restored AI sessions.
* **Codex MCP environment**: Documented the explicit stdio environment-variable allowlist that prevents the managed browser MCP from exiting before `initialize`.

## 2026-08-23

* **In-place conversion**: Converted the existing `docs/` tree into the canonical OKF v0.2 bundle instead of maintaining a duplicate `okf/` directory.
* **Deduplication**: Assigned one durable concept to each existing document and replaced repeated implementation, security, build, and lifecycle explanations with cross-links.
* **Source reconciliation**: Updated current-runtime claims to Electron sources and retained Tauri only as a transition concern.
* **Normalization**: Renamed concepts to lowercase kebab-case, redirected repository documentation links to `docs/index.md`, and removed the duplicate `docs/README.md` map.
