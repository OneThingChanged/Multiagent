---
okf_version: "0.2"
---

# MultiAgent knowledge

`docs/` is the canonical OKF v0.2 knowledge bundle for MultiAgent. Each linked
document covers one durable concept and points to the implementation or
configuration that supports it.

## Product and architecture

* [Product overview](product-overview.md) - Product goals, runtime shape, capabilities, and variants.
* [System architecture](system-architecture.md) - Electron boundaries, workspace model, layout invariants, and IPC rules.
* [Workspace interactions](workspace-interactions.md) - Navigation, sessions, panes, documents, source control, and notifications.

## Sessions and integrations

* [Session lifecycle and resume](session-lifecycle-and-resume.md) - PTY startup, hooks, cancellation, shutdown, and provider resume.
* [Local Dashboard](local-dashboard.md) - Loopback monitoring, terminal, document, and usage surfaces.
* [MiraControl integration](miracontrol-integration.md) - Authenticated session state, activation, and guarded input API.
* [Remote service](remote-service.md) - External Remote/PWA/Android access, authentication boundary, and conversation UX prototype.
* [Usage accounting](usage-accounting.md) - Local token indexing, historical aggregation, and account limits.
* [Embedded browser MCP](embedded-browser-mcp.md) - Always-on shared browser tabs, managed MCP startup, annotations, and isolation rules.

## Delivery and maintenance

* [Development and build](development-and-build.md) - Local setup, tests, smoke checks, and desktop/mobile build entry points.
* [Release playbook](release-playbook.md) - Signing, artifact verification, publication, and updater invariants.
* [Microsoft Store MSIX delivery plan](microsoft-store-msix-plan.md) - Deferred account, packaging, migration, certification, and rollout steps for complimentary Store signing.
* [Known limitations](known-limitations.md) - Confirmed constraints and explicitly unverified follow-up items.
