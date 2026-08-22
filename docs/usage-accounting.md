---
type: Operational Model
title: Usage accounting
description: "Local transcript-derived token indexing, historical aggregation, and account-limit display."
tags:
  - usage
  - tokens
  - sqlite
status: stable
stale_after: 2026-10-31
sources:
  - id: usage-service
    resource: ../app/electron/services/usage-service.mjs
    title: "Electron usage service"
  - id: usage-tests
    resource: ../app/electron/services/usage-service.test.mjs
    title: "Usage aggregation tests"
  - id: usage-ui
    resource: ../app/electron/remote-pwa/app.js
    title: "Dashboard and Remote usage UI"
  - id: status-bar
    resource: ../app/src/components/UsageStatusBar.tsx
    title: "Desktop account-limit status bar"
---

# Usage accounting

Usage data is a local derived index of supported provider transcripts. It is not
provider billing truth and is not an exact measure of monetary cost.[^usage-service]

## Incremental collection

The Electron service scans Codex and Claude transcript sources, parses supported
token events, and stores source identity and offsets so later refreshes process
only new material. Events are deduplicated and rolled into daily aggregates;
reopening the usage page does not require rebuilding all history.[^usage-service][^usage-tests]

Remote SSH transcripts that do not exist on this PC are outside this ingestion
model.

## Local storage

SQLite runs in WAL mode and stores event identity, time, project, agent,
provider session, tool, model, working folder, and input/output/cache/reasoning
token dimensions. Daily totals can be rebuilt from indexed events.[^usage-service]

The database belongs to local application data, not Git. Deleting it discards
the local index; a later scan can reconstruct only data still present in
supported transcript sources.

## Historical views

The usage UI supports ISO week, calendar month, and calendar year selection,
previous-period comparison, and appropriate daily or monthly buckets. Available
year bounds are derived from stored events instead of a hard-coded range.[^usage-tests][^usage-ui]

Totals include input, output, cache read/write, and reasoning where the provider
event exposes them. Cache dimensions must not be silently reclassified as fresh
input.

## Account limits

Codex limit snapshots come from recent transcript `token_count` events. Claude
limits are fetched from the local Claude Code OAuth usage endpoint only when a
usable local credential exists. These percentages describe provider reset
windows, not “tokens remaining” in the local history database.[^usage-service][^status-bar]

Refresh failures preserve the last useful snapshot and expose an error/staleness
state rather than replacing it with a fabricated zero.

[^usage-service]: Electron usage service
[^usage-tests]: Usage aggregation tests
[^usage-ui]: Dashboard and Remote usage UI
[^status-bar]: Desktop account-limit status bar
