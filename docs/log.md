# OKF Update Log

## 2026-08-23

* **In-place conversion**: Converted the existing `docs/` tree into the canonical OKF v0.2 bundle instead of maintaining a duplicate `okf/` directory.
* **Deduplication**: Assigned one durable concept to each existing document and replaced repeated implementation, security, build, and lifecycle explanations with cross-links.
* **Source reconciliation**: Updated current-runtime claims to Electron sources and retained Tauri only as a transition concern.
* **Normalization**: Renamed concepts to lowercase kebab-case, redirected repository documentation links to `docs/index.md`, and removed the duplicate `docs/README.md` map.
