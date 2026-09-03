---
type: Plan
title: Embedded browser form automation plan
description: "A safe, state-aware automation contract for native and custom browser form controls in the Electron browser and managed MCP bridge."
tags:
  - browser
  - mcp
  - forms
  - automation
  - security
status: draft
stale_after: 2026-12-31
sources:
  - id: electron-browser-runtime
    resource: ../app/electron/main.mjs
    title: "Electron browser ownership, snapshots, and integration actions"
  - id: browser-context
    resource: ../app/electron/services/browser-context.mjs
    title: "Browser snapshot and annotation sanitization"
  - id: browser-mcp-server
    resource: ../app/electron/services/browser-mcp-server.mjs
    title: "Managed browser MCP tool schemas and dispatch"
  - id: browser-context-tests
    resource: ../app/electron/services/browser-context.test.mjs
    title: "Current browser sanitization tests"
  - id: browser-integration-tests
    resource: ../app/electron/services/electron-services.test.mjs
    title: "Authenticated browser integration contract tests"
---

# Embedded browser form automation plan

## Outcome

Extend the managed Electron browser MCP from generic CSS `click`/`type` into a
state-aware form automation surface. An agent should be able to identify a
control by its accessible meaning, set a checkbox or radio button idempotently,
choose a native or custom dropdown option, clear a text field, wait for a
re-render, and verify the resulting state. The browser must return enough
sanitized state to explain what happened without exposing passwords, file
paths, tokens, cookies, or arbitrary page JavaScript.

The state-aware snapshot, semantic targeting, native checkbox/radio/select
actions, common ARIA combobox selection, clear, scroll, bounded wait, and
postcondition baseline described here was implemented on 2026-09-03. Audit
retention and broader non-standard widget coverage remain hardening work.

## Implementation status — 2026-09-03

* Complete: richer sanitized control snapshots, stable target IDs, ambiguity
  errors, control/form inspection, idempotent checked state, native and common
  ARIA selection, clear, scroll, bounded waits, and before/after verification.
* Complete: fixed MCP schemas and authenticated integration routing while
  preserving the legacy selector-based click/type tools.
* Complete: unit coverage plus a real hidden-Electron fixture smoke for native
  controls, DOM replacement, ARIA selection, and password/file redaction.
* Pending hardening: bounded local action audit retention, more non-standard
  custom widget patterns, and optional navigation lifecycle telemetry.

## Previous baseline and observed gaps

Before the 2026-09-03 implementation, the browser surface was concentrated in
three modules and had the following gaps:

* `app/electron/main.mjs` owns the `WebContentsView`, evaluates the current
  snapshot, and handles the authenticated integration actions. The snapshot
  currently scans the first 100 matching nodes and exposes only `tag`, `type`,
  display text, `ariaLabel`, a generated CSS selector, and `disabled`. The
  selector prefers an id, then a short class/structural path with
  `:nth-of-type(...)`, so it can change after a framework re-render or match a
  different repeated row.
* `app/electron/services/browser-context.mjs` clips the snapshot to 80
  controls and preserves the same small field set. It already sanitizes URLs,
  HTML, and sensitive-looking attributes, but it cannot sanitize richer form
  state until that state has an explicit contract.
* `app/electron/services/browser-mcp-server.mjs` exposes generic
  `browser_click` and `browser_type` tools. The main process calls
  `node.click()` for clicks and a native `value` setter followed by `input` and
  `change` events for text entry. There is no clear operation, control lookup,
  select/checkbox/radio operation, wait, scroll-to-control operation, or
  post-action verification. `browser_type` also rejects empty input, so it
  cannot clear a field.

The existing password and file-input blocks are correct safety boundaries and
must remain. File selection is also deliberately manual today; form
automation must not silently turn it into an OS file chooser or expose a local
path.

## Scope and non-goals

### In scope

* Native `input`, `textarea`, `select`, button, and contenteditable controls.
* Checkbox, radio, switch, combobox, and listbox semantics, including common
  ARIA-rendered custom widgets.
* Accessible names, roles, labels, state, validation, visibility, and bounded
  waits.
* Stable target resolution across React, Angular, Vue, and similar DOM
  replacement/re-render patterns.
* Backward-compatible support for existing selector-based MCP calls while new
  callers migrate to semantic targets.

### Explicitly out of scope for the first release

* Arbitrary page JavaScript, DevTools protocols, cookie/storage export, or DOM
  HTML returned as a form-state shortcut.
* Password values, password submission, and secret-bearing autocomplete fields.
* Automated file chooser interaction or file path transfer. The first phase
  keeps file upload explicit and manual in the UI.
* A general-purpose browser agent that automatically submits purchases,
  account deletion, or other irreversible actions without a user-visible
  action.

## Proposed sanitized control snapshot

`browser_snapshot` should keep the existing bounded page text/link response but
replace the minimal control entries with a versioned, sanitized descriptor. A
recommended entry shape is:

```json
{
  "targetId": "c-7f4a2d9b",
  "locator": {
    "strategies": [
      { "kind": "id", "value": "email" },
      { "kind": "label", "value": "Email address", "role": "textbox" },
      { "kind": "name", "value": "email", "tag": "input" }
    ]
  },
  "tag": "input",
  "role": "textbox",
  "type": "email",
  "name": "email",
  "label": "Email address",
  "ariaLabel": "",
  "placeholder": "name@example.com",
  "text": "",
  "visible": true,
  "inViewport": true,
  "enabled": true,
  "disabled": false,
  "readonly": false,
  "required": true,
  "checked": null,
  "selected": null,
  "valueState": "text",
  "value": "user@example.com",
  "options": [],
  "validity": {
    "valid": true,
    "valueMissing": false,
    "typeMismatch": false,
    "patternMismatch": false,
    "customError": false,
    "message": ""
  }
}
```

The exact JSON names should be finalized in a shared helper before the MCP
schema is published. The following rules are the important part of the
contract:

* `role` is the computed semantic role, with explicit ARIA role taking
  precedence only when it is a supported interactive role. `tag`, normalized
  `type`, `name`, accessible `label`, `ariaLabel`, placeholder, visible text,
  and form/fieldset context are bounded strings.
* `visible`, `inViewport`, `enabled`, `disabled`, `readonly`, and `required`
  describe the current DOM state. Visibility should account for client rects,
  `display`, `visibility`, and disabled/inert ancestors; opacity alone should
  not hide a control from lookup if it is still layout-visible.
* `checked` is boolean for checkbox, radio, and switch-like controls and
  `null` for unrelated controls. Preserve `indeterminate` separately for a
  native checkbox. `selected` is boolean for an option/listbox item and
  `null` otherwise.
* `value` is only a safe, bounded current value for ordinary text-like
  controls. Use `valueState: "empty" | "text" | "redacted" | "file"` so an
  agent can distinguish an empty field from intentionally withheld state.
  Password inputs, password autocomplete values, file inputs, and controls
  whose name/id/label/placeholder resembles a credential are always
  `redacted` or `file`; their value is never serialized, including in an
  error, before/after result, HTML snippet, or audit entry.
* A safe text field may expose length and a short value preview only if the
  control is not sensitive. The default should be `valueState` plus length;
  returning the full ordinary value is useful for verification but must be
  bounded and configurable. A caller cannot disable redaction.
* Native `select` entries include a bounded `options` array containing
  accessible option `label`, `selected`, `disabled`, and index. Include the
  option `value` only when it passes the same secret classifier; otherwise use
  `valueState: "redacted"`. For a multi-select, include all selected indexes,
  never unbounded option values.
* `validity` mirrors safe `ValidityState` booleans: `valid`, `valueMissing`,
  `typeMismatch`, `patternMismatch`, `tooLong`, `rangeUnderflow`,
  `rangeOverflow`, `stepMismatch`, and `customError`. The browser may expose a
  short `validationMessage` only after removing credential-like substrings and
  clipping it; sensitive controls return an empty message. Also report bounded
  visible validation text associated through `aria-errormessage` or
  `aria-describedby`, without returning its HTML.
* `formId`, `formLabel`, `fieldsetLabel`, and `autocomplete` may be included as
  bounded semantic context. Do not return arbitrary attributes or `dataset`;
  retain only a short allowlist needed for targeting (`id`, `name`, `for`,
  `aria-*` references, `data-testid`/`data-qa` after secret filtering).
* Include `truncated: true` and counts when page/control limits are reached.
  Do not silently imply that the first 80/100 controls are the complete form.
  Keep hard limits (for example, 200 controls, 100 options per select, and
  bounded strings) in the sanitization module.

This descriptor gives the agent state, but it is not an authority to mutate a
page. Every action must resolve the target again in the live document.

## Stable target locators and ambiguity handling

### Locator model

Add a semantic `targetId` and a list of ordered locator strategies to each
control. `targetId` should be a short hash of normalized, non-secret semantic
identity and page context; it must remain the same when a framework replaces
the node. It is not a DOM id and must not require a page mutation. A locator
should contain the strongest available strategies in this order:

1. Valid, unique DOM `id`.
2. Stable test hook (`data-testid`, `data-qa`, or equivalent allowlisted
   attribute) after secret-name filtering.
3. Explicit label association (`label[for]`) plus role/type.
4. Accessible name plus role and form/fieldset context.
5. Stable `name` plus tag/type and form context.
6. A bounded structural fallback only when the preceding strategies are not
   available. It must not be the only identity for a repeated row if it uses
   `nth-of-type`.

The response may retain the current `selector` field as a legacy fallback for
old agents, but new tools should send `{ targetId }` or the structured
`locator`. Raw arbitrary CSS remains accepted for compatibility with a strict
length/complexity limit and is never generated as the preferred identity.

### Resolution algorithm

Create one internal resolver used by snapshot lookup and every form action:

1. Re-snapshot the live document and resolve all locator strategies in order.
2. Filter out non-interactive, detached, or hidden matches unless the action
   explicitly requests a hidden inspection target.
3. Require exactly one match. Never silently select the first result.
4. If a framework re-render detached the node between resolve and action,
   resolve once more by `targetId` and retry the bounded action; then return a
   re-render error if it still cannot be verified.
5. If zero matches exist, return `target_not_found` with the current URL,
   targetId, and a request to refresh the snapshot. Do not return the missing
   selector's page HTML.
6. If multiple matches exist, return `ambiguous_target` with safe candidate
   summaries (targetId, role, label, form/fieldset context, visibility, and
   index). Ask the caller to refine the target or scope; never guess.

The resolver should distinguish `disabled_control`, `readonly_control`,
`unsupported_control`, and `sensitive_control` from a generic not-found error
so the agent can take the appropriate next step.

## MCP tool surface

Keep existing tools and add explicit schemas in
`app/electron/services/browser-mcp-server.mjs`. Each new tool accepts `tabId`
and a semantic `target` (targetId or locator); a legacy `selector` may be
accepted during migration. All operations return a common stateful result:

```json
{
  "ok": true,
  "action": "set_checked",
  "target": { "targetId": "c-7f4a2d9b", "role": "checkbox", "label": "Use worldwide markets" },
  "changed": true,
  "skipped": false,
  "before": { "checked": false, "disabled": false },
  "after": { "checked": true, "disabled": false },
  "postcondition": { "kind": "checked", "satisfied": true },
  "warnings": []
}
```

State fields in all results go through the same sanitizer as snapshots. Text
input results should report length and safe value state by default, not echo
the submitted text. Errors use stable codes and a bounded safe detail, for
example `target_not_found`, `ambiguous_target`, `invalid_target`,
`disabled_control`, `readonly_control`, `sensitive_control`,
`unsupported_control`, `verification_failed`, and `wait_timeout`.

### `browser_get_control`

Return one sanitized live descriptor for a target, including options and
validation state when applicable. This is the smallest way to inspect a form
without requesting the entire page snapshot. It should return an ambiguity
error rather than guessing.

### `browser_form_state`

Return a bounded list of controls in a form or fieldset, selected by form
target, form id, or semantic scope. Include counts and validation summary. Do
not return hidden password/file values. A form with no unique scope should
return `ambiguous_target`.

### `browser_set_checked`

Input: `{ target, checked }`.

* For a native checkbox, click only when the current checked state differs from
  the requested state. If it already matches, return `changed: false,
  skipped: true` and still verify the state.
* For a radio, `checked: true` selects it; `checked: false` returns
  `unsupported_control` because a radio cannot be unchecked by a user action.
* For an ARIA checkbox or switch, use its visible user-like click target and
  verify `aria-checked`/role state after the event. Do not assign an arbitrary
  property directly.
* A disabled or readonly control fails without dispatching an event.

### `browser_select_option`

Input: `{ target, option: { label?, value?, index? }, multiple? }`.

For a native `select`, prefer accessible label, allow a non-sensitive value, or
an option index. Support one option for a single-select and a bounded array for
a multi-select. Use the native select value/selected setter plus the normal
`input`/`change` event sequence, then re-read selected options. Do not select a
disabled option.

For an ARIA combobox/listbox, focus and scroll the visible control into view,
open it with a real click or keyboard sequence, move through visible options by
accessible label, and commit with `Enter` (or the widget's standard selection
key). Confirm `aria-expanded`, `aria-activedescendant`, `aria-selected`, and
the visible selected label. If the widget cannot be operated through these
bounded user-like events, return `unsupported_control` with guidance for
manual interaction; never inject page JavaScript or set an unknown framework
state variable.

### `browser_clear`

Clear a non-sensitive text input, textarea, or contenteditable control. It is
the explicit empty-value counterpart to `browser_type`; it must work even
though `browser_type` currently rejects an empty string. Return before/after
safe value state and verify that the framework did not restore the old value.
Password, file, and credential-like controls remain blocked.

### `browser_scroll_into_view`

Resolve a target and scroll it into the maintained browser view with
`scrollIntoView({ block: "center", inline: "nearest" })` through the fixed
internal evaluator. Return geometry and `inViewport` after the scroll. This
tool is useful before a user-like click and does not expose a general script
execution capability.

### `browser_wait_for`

Input: `{ target?, condition, expected?, timeoutMs? }`, where condition is one
of `visible`, `hidden`, `enabled`, `disabled`, `checked`, `selected`,
`valueState`, `text`, `url`, `navigationComplete`, or `valid`.

Clamp the timeout to a small upper bound (for example 15 seconds for ordinary
waits and 30 seconds only for a navigation explicitly requested by the caller)
and poll at a fixed interval. Re-resolve the target after DOM replacement and
return the final sanitized state. A timeout returns `wait_timeout` with the
last safe state rather than hanging the MCP child. URL matching uses the
existing URL sanitizer and origin/path rules; it must not echo query secrets.

## Native control and framework event handling

Avoid putting form-specific logic directly into the large Electron main module.
Extract a fixed internal evaluator/resolver into a new module such as
`app/electron/services/browser-form-automation.mjs`. It can generate bounded
scripts or helper functions consumed by `main.mjs`, but it must not become a
user-supplied JavaScript execution endpoint.

The implementation should use these event rules:

* Text inputs and textareas: focus the resolved node, use the relevant native
  prototype value setter so React/Angular/Vue observers see a real value
  change, dispatch a bubbling `input` event with a safe `InputEvent` where
  available, then `change` after the operation. Verify after at least one
  animation frame and a bounded microtask turn.
* Contenteditable: focus, replace the current selection through a bounded
  user-like edit path, dispatch `beforeinput`/`input`, and verify text content.
  Do not serialize the editable HTML. Treat credential-looking editable
  regions as sensitive.
* Native checkbox/radio: use `click()` only as the fixed internal user-like
  operation after checking current state. Do not assign `.checked` and then
  fake a click, which can desynchronize controlled frameworks.
* Native select: update through the native select/option property path and
  dispatch the standard bubbling events. For controlled React selects, reread
  after the framework's render turn and retry once if it restored the previous
  value.
* Custom widgets: identify only supported ARIA roles and visible descendants.
  Use focus, click, and allowlisted keyboard input (`ArrowUp`, `ArrowDown`,
  `Home`, `End`, `Enter`, `Escape`, and `Space`) through the existing native
  input boundary. Verify accessibility state and visible label instead of
  trusting a guessed CSS class.
* All actions must check `disabled`, `aria-disabled`, `readonly`, inert/hidden
  state, and sensitive classification immediately before mutation.

## Navigation, re-render, and postcondition behavior

Every mutating tool follows this sequence:

```text
resolve target
  -> capture safe before state
  -> scroll/focus if needed
  -> perform one bounded native/user-like action
  -> wait for input/change and one render turn
  -> resolve target again
  -> capture safe after state
  -> verify requested postcondition
  -> return before/after or a typed error
```

For navigation-triggering clicks, the action wrapper should listen to the
existing webContents navigation/loading lifecycle and also allow SPA changes
that do not emit a full navigation. Do not wait indefinitely for a `load`
event from a page that remains open. Return tab metadata plus a
`navigation: { started, settled, urlChanged }` summary, with a bounded wait
and the sanitized final URL.

If a click causes a modal or framework re-render, a postcondition may be
specified by the caller (`visible`, `text`, `url`, or target state). Without a
postcondition, still verify that the original action dispatched and return the
new snapshot state. A result with `verification_failed` must include the last
safe state and a remediation hint, never raw DOM or script output.

## Security and audit boundaries

The following boundaries are mandatory:

* Keep arbitrary JavaScript unavailable through MCP. All browser evaluation is
  fixed, parameterized internal code in the main process. Reject selectors and
  locator strings above strict length/complexity limits.
* Preserve the password and file-input blocks in every path, including
  `browser_get_control`, `browser_form_state`, wait predicates, before/after
  state, validation messages, screenshots/annotations, and errors. Metadata
  may identify a control as redacted; values and local file paths never leave
  the main process.
* Expand the sensitive classifier beyond `type=password` to password
  autocomplete tokens and credential-like names, labels, ids, placeholders,
  `aria-*`, and option values. Use a single shared classifier in the main
  evaluator and `browser-context.mjs` sanitizer so one path cannot leak what
  another blocks.
* Do not return cookies, storage, authorization headers, full attributes,
  `outerHTML`, HTML form values, or page scripts. Continue using existing URL
  redaction for query/hash material.
* Audit each action as `{ agentId, tabId, action, targetId, locatorKind,
  origin, timestamp, outcome }`. Log text length/value state, not typed text;
  log option index/label only after sensitivity filtering; redact URL query
  values and all error details that could contain submitted data. Keep audit
  retention bounded and local to the existing app diagnostics policy.
* Keep file upload manual in phase one. Any later explicit upload API would
  need user confirmation, project/path allowlisting, one-shot handles, and a
  separate security review; it must not accept a raw arbitrary path from an
  agent.
* Preserve the existing authenticated loopback token and agent ownership
  checks. A browser action must operate only on the requesting agent's
  associated tab and must not cross sessions.

## Implementation targets

The implementation is split into small modules so the Electron entry point
remains reviewable. Items described as follow-up remain planned hardening:

1. `app/electron/services/browser-form-automation.mjs` (new): control role/name
   computation, secret classification, locator construction/resolution,
   native/custom control action evaluators, bounded wait predicates, and
   before/after result builders. Keep the evaluator fixed and parameterized.
2. `app/electron/main.mjs`: import the helper; upgrade
   `executeBrowserSnapshot`; replace the current `browserClick` and
   `browserType` internals with shared target resolution; add handlers for
   `get-control`, `form-state`, `set-checked`, `select-option`, `clear`,
   `wait-for`, and `scroll-into-view`; preserve authenticated tab ownership
   and navigation lifecycle handling.
3. `app/electron/services/browser-context.mjs`: sanitize the richer descriptor,
   add common limits and sensitive-value handling, preserve legacy fields, and
   sanitize action result/error objects.
4. `app/electron/services/browser-mcp-server.mjs`: publish versioned input
   schemas and descriptions for the new tools, map names to integration
   actions, and keep legacy `browser_click`/`browser_type` compatibility.
5. `app/electron/services/browser-form-automation.test.mjs` (new): unit test
   locators, role/name computation, secret classification, native state
   transitions, idempotence, option matching, wait predicates, and redaction.
6. `app/electron/services/browser-form-fixture.html` (new): a local fixture
   containing native single/multi-selects, checkboxes, radios, disabled and
   readonly controls, required/invalid fields, password/file controls, duplicate
   labels, a re-rendering controlled field, and ARIA combobox/listbox examples.
7. `app/scripts/electron-browser-form-smoke.mjs` (new) and `app/package.json`:
   add a fixture-driven Electron smoke command that loads the local page and
   exercises the real WebContentsView/integration path. Keep it separate from
   production packaging and include it in the normal verification checklist.
8. `app/electron/services/browser-context.test.mjs` and
   `app/electron/services/electron-services.test.mjs`: extend sanitization and
   authenticated endpoint contract coverage; verify legacy selector calls,
   new actions, error status mapping, agent ownership, and no secret leakage.
9. `docs/embedded-browser-mcp.md`: after implementation, document the new
   snapshot schema, tool list, compatibility behavior, and security limits.
   This plan remains the design record and should link to the final tests.

## Test matrix

The fixture/smoke suite must cover at least:

| Area | Required checks |
| --- | --- |
| Native text | type, clear, ordinary value state, required/invalid state, React-style controlled re-render, input/change ordering |
| Checkbox | set true/false, already-correct no-op, indeterminate state, disabled and `aria-disabled` rejection |
| Radio | select one member, group state, refusing an unsafe false operation, duplicate labels with scoped resolution |
| Native select | label/value/index selection, disabled option, multi-select, selected-state verification, controlled re-render |
| Custom select | ARIA combobox/listbox open, keyboard navigation, visible option selection, unsupported widget error, bounded timeout |
| Lookup | id/label/name/test-hook strategies, duplicate accessible names, hidden controls, detached/re-rendered nodes, stable targetId |
| Validation | required, type/pattern/range/custom errors, sanitized validation text, post-action validity verification |
| Safety | password/file values absent from snapshots/results/logs; credential-like names redacted; arbitrary script and unsafe selectors rejected |
| Lifecycle | navigation-triggering click, SPA URL/state change, wait after re-render, tab close/destroy during wait, timeout upper bound |
| Compatibility | current `browser_click`/`browser_type` behavior, selector fallback, authenticated tab/agent ownership, existing URL/text limits |

Use unit tests for pure sanitization/locator logic and a real Electron fixture
for DOM/event behavior. The smoke test should assert the returned structured
result rather than relying only on screenshots; screenshots are useful as a
manual debugging artifact but must not be the source of truth for secret
redaction or state verification.

## Rollout phases

### Phase 0 — Contract and fixture (complete)

Define the descriptor/result schemas, extract the shared helper, add the local
fixture, and add redaction/locator unit tests. No existing tool behavior
changes beyond internal refactoring.

### Phase 1 — Snapshot and stable targeting (complete)

Ship richer sanitized controls, target IDs, semantic locators, ambiguity errors,
and `browser_get_control`/`browser_form_state`. Continue returning legacy
`selector` fields and accepting legacy selector arguments. Gate the new fields
behind a snapshot version if downstream clients need an upgrade window.

### Phase 2 — Native controls (complete)

Add `browser_clear`, `browser_set_checked`, and `browser_select_option` for
native controls, plus postcondition results. Update `browser_type` to permit an
explicit empty string only through `browser_clear` (or a documented clear
flag), preserving password/file blocking. Run the Electron fixture smoke test
on every change.

### Phase 3 — Waits, scrolling, and custom ARIA widgets (baseline complete)

Add `browser_wait_for` and `browser_scroll_into_view`, navigation/re-render
settling, and user-like combobox/listbox handling. Start with the standard ARIA
patterns and return an actionable unsupported error for non-standard widgets.

### Phase 4 — Hardening and release (in progress)

Add audit redaction checks, timeout/failure telemetry, documentation, remote
session ownership regression tests, and packaged Electron smoke coverage.
Review all new evaluator code for arbitrary-script exposure before enabling it
in the Store build. Roll out to the local MCP first, then Remote only if a
separate Remote action contract is needed; do not duplicate DOM logic in the
Remote JPEG/pointer relay.

## Acceptance criteria

The work is ready for general use when all of the following are true:

* A snapshot exposes semantic role/name, safe current state, select options,
  validation, visibility, and truncation metadata while never exposing
  password/file values, credential-like values, secrets, or arbitrary markup.
* The same target resolves after a representative framework re-render. A
  duplicate label or selector produces a deterministic ambiguity error with
  safe candidates; no action silently chooses the first match.
* Checkbox/radio/select/clear tools are idempotent where the HTML control
  permits it, dispatch framework-compatible native events, and return verified
  before/after state. A failed postcondition is explicit and actionable.
* Native selects and common ARIA combobox/listbox controls work through
  bounded user-like interaction. Unsupported custom widgets fail safely.
* Waits and navigation settling have hard upper bounds and survive a DOM
  replacement without hanging the MCP process.
* Existing selector-based tools and authenticated tab/agent isolation continue
  to pass regression tests.
* Unit, fixture-driven Electron, endpoint-contract, and security-redaction
  tests pass; no new path exposes arbitrary JavaScript, cookies/storage,
  password/file values, or raw typed text in logs/results.
