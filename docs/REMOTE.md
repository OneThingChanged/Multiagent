# Remote PWA

A Standard-only mobile remote for checking desktop MultiAgent sessions from a phone/tablet, giving short commands, and viewing local project Markdown/HTML documents. On Electron apps 0.5.31+, `app/electron/services/web-services.mjs` provides the server and `app/electron/remote-pwa/` provides the shared mobile UI. That UI can be opened in a browser/PWA or through the native Android shell under `mobile/`.

Company builds hide the Remote tab in Settings and reject Remote·Tunnel commands in main IPC. They still package the shared `electron/remote-pwa/` shell because the loopback Dashboard uses it, but exclude every mobile APK resource and keep external Remote/Tunnel runtime features disabled.

## Overall Flow

```text
[Phone PWA / Android app] ──HTTPS──> Cloudflare Tunnel ──> [My PC] 127.0.0.1:<port>
           │                                                       │
           ├─ GitHub login + account approval                      ├─ session/hook/recent output query
           ├─ Markdown/HTML document browser                       ├─ sandboxed local project document read
           ├─ bounded image attachment upload                      ├─ attachment saved under app data
           ├─ Web Push / native status alerts                      └─ short input to the selected PTY
           └─ PWA install or native Android shell
```

The Remote server does not listen on an external NIC; it binds to loopback only. Phone access uses the HTTPS tunnel URL. The local URL is for preview/diagnostics on the desktop PC.

## Remote Screen Layout

- **Status model**: working · needs-answer · done · waiting · inactive states still drive filters, badges, hooks, and notifications, but the desktop-oriented Monitor board itself is omitted from Remote navigation
- **Screens**: desktop/tablet Remote can inspect the desktop's split Screens and pane/tab layouts. Phone-width Remote intentionally hides Screen navigation and opens an individual Session instead
- **Sessions**: per-project session list with status filters and search. The `Active` filter combines working, needs-answer, recovering/starting, done, and waiting sessions while excluding inactive sessions. A restored PTY remains **Recovering** until its AI CLI emits a hook; it is never counted as working merely because the process started. The selected session opens in a compact full-height chat/terminal view with a keyboard-safe composer
- **Documents**: choose a local project and browse its `.md`/`.markdown`/`.html`/`.htm` files in a collapsible folder tree. Generated/internal roots such as `.build-tools`, `.claude`, `.codex`, `.qwen`, `node_modules`, `build`, and `target` are excluded. Search keeps only matching documents and their parent folders visible. On phones the document tree is a dedicated full-screen drawer; selecting a file closes it and gives the Markdown/HTML preview the full remaining viewport. Markdown supports headings, lists, task items, tables, code fences, and relative links to another listed document. HTML runs in a script-disabled sandbox iframe
- **Usage**: a combined token/account view. It shows today/this-week/this-month token totals, a recent 30-day daily graph, cumulative input/output/cache read/write/reasoning details, and Codex/Claude rolling-window remaining percentage, reset time, plan, and extra-usage availability
- **Android app**: stores one approved Remote endpoint and loads the same PWA in a constrained native WebView. Its connection bar starts collapsed so the chat/terminal keeps nearly the full screen; expand it for back, reload, or address change. A user-enabled `remoteMessaging` Foreground Service keeps an authenticated long-poll connection and shows generic local completion/question notifications without Firebase, FCM, or Expo Push
- **APK download**: after login and desktop approval, the top bar shows an `APK` button when a standard packaged build contains the separately verified `resources/mobile/MultiAgent-Mobile.apk`. Development can point at the same release artifact with `MULTIAGENT_MOBILE_APK_PATH`. The Remote server streams that file directly and supports interrupted-download resume
- On phone widths, navigation lists appear as a slide menu and Screen mode is unavailable. A root visit opens an active Session, and an old `?screen=` link redirects to an available session from that Screen
- Session detail automatically collapses the fixed left navigation at tablet/small-desktop widths (up to 1180px). In this focus layout the global header is removed, and a single compact row contains the navigation button, session name/status, and Chat/Terminal switch
- Session detail defaults to parsed Codex/Claude chat and can switch to the live xterm terminal. Windows extended transcript paths (`\\?\C:\...`) are normalized before transcript reads
- Session chat and terminal modes keep only image attachment + one-line message input + Send in one compact row. Mobile also hides the global top bar and duplicate request/question panels and compacts its header/mode switch
- For local sessions, the attachment button accepts up to four PNG/JPEG/GIF/WebP/BMP files per draft. Each image is uploaded to the host app (8MB maximum), previewed/removable before send, and its host path is appended to the selected session message. SSH sessions disable this button because the remote shell cannot read a path on the host PC
- On phones/tablets, the live terminal fits both the desktop PTY width and height into the available panel so its bottom rows are not clipped behind the composer. One-finger vertical drags scroll normal xterm scrollback; alternate-screen TUIs receive wheel/PageUp/PageDown input. Pinch zoom and link taps remain available
- The session view tracks `visualViewport.height` on mobile so browser chrome and the software keyboard shrink only the chat/terminal area. While typing, the fixed bottom navigation is temporarily hidden and the composer remains visible above the keyboard
- Latest user request, interactive question, recent terminal output
- Send instructions/question answers from Session detail, or from a Screen pane on desktop/tablet Remote
- Sending a message to an inactive Session from **Chat** mode requests activation, keeps the message in a bounded pending queue, and sends it once the PTY reports ready. If activation does not complete within 30 seconds the pending message is cancelled with an error. Inactive Terminal mode remains read-only so raw key input cannot accidentally race session startup
- The Session composer accepts images from the attachment button, clipboard paste, or drag and drop. PNG, JPEG, GIF, WebP, and BMP files use the same preview/upload queue without interfering with ordinary text paste; the existing four-image and 8MB-per-image limits still apply
- The Session composer grows with multi-line input instead of staying at two lines. It expands to a viewport-bounded height, then switches to internal scrolling so the conversation and send controls remain visible with a mobile keyboard open
- Project-local Markdown, HTML, and image paths shown in Remote chat are clickable, including inline-code paths, Markdown links, and `file:line` output. Relative paths resolve from the selected session's configured working folder. Windows drive paths are normalized even when Markdown produces `/G:/...`; an absolute path may select another registered local project that contains the file, while paths outside every registered project remain blocked. Markdown and images open in the overlay viewer, while HTML uses a script-disabled sandbox and inlines stylesheets/images from the resolved project without leaving the conversation
- File preview resolution merges live session status with synchronized project/session metadata by agent id. If restored or older state briefly omits the agent working folder, relative paths safely fall back to the selected project root until the full metadata arrives
- Messages entered while a session is recovering/starting stay queued until initialization completes. Raw Terminal input is blocked during that interval. A `SessionStart` or another live agent hook marks the CLI ready; a live PTY falls back to ready after 20 seconds if the ready hook was lost, without ever reporting the fallback as active work
- Pressing **Stop** (or Esc in the Remote chat composer) calls the dedicated cancellation endpoint. The host writes Esc to the live PTY and emits a synthetic `cancelled` hook, clearing the stale working activity without treating the turn as successfully completed. The live session returns to waiting/idle immediately and can accept the next queued or newly entered message
- Every desktop/tablet Screen pane has its own **Chat / Terminal** switch. Chat mode shows the selected tab's recent parsed conversation, tool groups, working indicator, and interactive prompts without leaving the multi-pane Screen
- Screen (desktop/tablet only), Session, Documents, and Usage views fill the visible viewport below the compact top bar. The browser-side scrollbar is removed; navigation and the active content surface keep their own independent scrolling. Session detail also hides the global header so the focused workspace uses the full viewport
- The large global status summary and standalone Monitor dashboard are hidden in Remote. On desktop/tablet the root selects the first Screen; on phone widths it selects an active Session. Documents and Usage are the remaining fallbacks
- Session detail always exposes a header button for collapsing or restoring the left Screen/Session list on desktop/tablet; on mobile the same control opens the Session-only navigation drawer
- `Ctrl/⌘ + Enter` to send, copy recent output
- Browser **Install app / Add to Home Screen** support
- Browser/PWA completion and interactive-question notifications use Web Push after permission and subscription are enabled. The Android APK instead uses its own Foreground Service while the required ongoing notification is visible. It continues when the WebView is backgrounded and can survive removing the task, but force-stop/service termination disables delivery until the user enables it again. Tapping an event notification reopens the matching Session
- Offline, only the app shell opens; session API/input are network-only

The loopback Dashboard preview uses the same PWA and accepts PTY input from the browser's actual same-origin host, including a LAN hostname or a trusted reverse proxy's forwarded host. Cross-site origins remain blocked. This lets a Dashboard page forwarded to another computer send text without weakening the Remote server's login and approval boundary.

Desktop/tablet Screen selection changes only inside the Remote browser and does not change the desktop MultiAgent's current Screen or active session. Phone-width Remote does not expose Screen selection. File editing and screen sharing are not in the MVP.

## HTTP Endpoints

| path | description |
|---|---|
| `GET /` | PWA main screen for approved users |
| `GET /login` | GitHub web/Device Flow login screen |
| `GET /manifest.webmanifest` | PWA install manifest |
| `GET /sw.js` | offline shell / notification service worker |
| `GET /api/state` | projects, sessions, hooks, recent output state |
| `GET /api/usage?refresh=1` | cumulative token totals plus current Codex/Claude account-limit snapshots. `refresh=1` requests a live limit refresh and is throttled to once every 30 seconds |
| `GET /api/push/public-key` | current server VAPID public key for an approved PWA client |
| `POST /api/push/subscription` | register/update an approved same-origin Web Push subscription |
| `DELETE /api/push/subscription` | remove the caller's same-origin Web Push subscription |
| `POST /api/monitor/device` | issue a revocable, notification-only Android token to an approved same-origin session |
| `GET /api/monitor/device?cursor=...` | authenticated long-poll for privacy-safe completion/question events; Bearer device token required |
| `DELETE /api/monitor/device` | revoke the calling Android device token; Bearer device token required |
| `POST /api/input` | deliver input to the active PTY. JSON, same-origin, 8KB limit |
| `POST /api/attachment` | save one same-origin image attachment under app data. JSON data URL, 8MB decoded limit |
| `GET /api/stream?id=...` | SSE backfill and live PTY output for the xterm view |
| `GET /api/chat?id=...` | parsed Codex/Claude transcript blocks for the chat view |
| `POST /api/session/restart` | request activation of an inactive session |
| `POST /api/session/cancel` | interrupt an active turn and publish a `cancelled` hook so the live session returns to idle |
| `GET /api/docs?projectId=...` | list up to 500 Markdown/HTML documents under one synchronized local project |
| `GET /api/docs/read?projectId=...&path=...&agentId=...` | read one Markdown/HTML document inside that project (2MB limit); optional `agentId` resolves relative paths from that session's configured working folder |
| `GET /api/files/image?projectId=...&path=...&agentId=...` | stream a supported project image for the overlay viewer (25MB limit) |
| `GET /api/files/asset?projectId=...&path=...&agentId=...` | stream a project-local image or CSS asset while constructing a sandboxed HTML preview |
| `GET/HEAD /downloads/MultiAgent-Mobile.apk` | download the bundled ARM64 Android client APK; login/approval required, byte ranges supported |
| `GET /auth/mode` | returns web/device mode based on OAuth config |
| `POST /auth/start` | start GitHub Device Flow |
| `POST /auth/poll` | Device Flow token/user check |
| `GET /auth/github` | start GitHub OAuth redirect for fixed domains |
| `GET /auth/github/callback` | OAuth callback and session cookie issue |
| `POST /auth/logout` | expire the session cookie |

State syncs every 1.6 seconds, dropping to 5 seconds for a hidden PWA. Terminal output in Remote payloads is limited to the latest 24,000 chars per session.

## GitHub Auth & Approval

### Quick tunnel

Setting only the GitHub OAuth App's **Client ID** uses Device Flow. The phone shows a one-time code and you authenticate at `github.com/login/device`, so no callback URL edits are needed when the tunnel URL changes.

### Named tunnel

Setting Client ID + Client Secret + Public hostname uses the normal web redirect login. Register the OAuth App callback URL as:

```text
https://<public-hostname>/auth/github/callback
```

After login, you must still pass these approval rules.

- Owner: matches the GitHub username in Settings → allowed immediately
- Approved: accounts approved in desktop Settings → Remote PWA
- Pending: logged in but waiting for desktop approval
- Revoke: removing from the approval list rejects further requests even with a valid signed cookie

Session cookies are `HttpOnly`, `SameSite=Lax`, 7-day expiry. `Secure` is also applied for HTTPS tunnel requests. The signing key changes on server restart, requiring a new login.

## Cloudflare Tunnel

- Quick: with an empty token, `cloudflared tunnel --url <local-url> --no-autoupdate`
- Named: with a token, `cloudflared tunnel run --token <token>`
- On Windows, if the executable is missing, the official GitHub Latest `cloudflared-windows-amd64.exe` is auto-downloaded to the local data folder.
- Downloads stream to a temp file, reject responses under 1MB, then atomically rename.
- Startup waits up to 45 seconds for an actual public URL or named tunnel connection log before returning success.

Stored in the Standard local data folder as `remote-config.json`, `remote-access.json`, `cloudflared.exe`. The Client Secret and tunnel token are never sent to the browser.

## Security Boundaries

- The server listens on `127.0.0.1` only; external exposure goes through Cloudflare HTTPS.
- All APIs check login + approval. Only direct loopback requests are allowed without approval, for local diagnostics.
- Document paths are resolved from the selected session's configured folder when an agent id is supplied, then confined to its synchronized local project root. Absolute paths, `..` traversal outside the project, symbolic-link escapes, unsupported extensions, oversized files, and SSH projects are rejected. Dependency/build/cache folders are skipped while listing.
- Markdown raw HTML is escaped before rendering. HTML previews use an iframe without `allow-scripts` or `allow-same-origin`, so document scripts and parent-window access are blocked.
- PTY input and cancellation allow same-origin JSON POST only; cross-site requests, wrong Content-Type, empty values, over-8KB input, and exited sessions are rejected.
- Image uploads use the same approval and same-origin boundary. The server ignores client file paths, accepts five raster MIME types only, verifies their file signatures, caps decoded files at 8MB, and writes random names under `remote-attachments` in the app data folder.
- PWA responses use strict CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, and a restricted Permissions Policy.
- The service worker caches only the static shell; `/api/**`, `/auth/**`, and all POSTs are never cached.
- Account-limit requests use the same login/approval boundary as session state. The browser receives only normalized percentages, reset times, plan labels, and credit state; local OAuth credentials are never exposed.
- Browser Push subscription writes require the same login/approval and same-origin checks as PTY input. VAPID keys and browser endpoints are stored only in `%LOCALAPPDATA%\com.jintae.multiagent\remote-push.json` with owner-only file mode where supported.
- Android monitor tokens are 256-bit random values issued only to an approved same-origin session. The PC persists only their SHA-256 hashes in `%LOCALAPPDATA%\com.jintae.multiagent\remote-monitor-devices.json`; the raw token is encrypted with Android Keystore. There is no token-list/readback API. Logout revokes the active token, account revocation removes every token owned by that login, and tokens expire after 180 days. Event bodies contain only project/session display names, a validated agent id, and `작업이 완료되었습니다.` or `응답이 필요합니다.`—never prompts, terminal output, file paths, or tool input
- The native WebView bridge accepts only validated monitor start/stop messages from the configured Remote origin. Public endpoints require HTTPS. Notification taps accept only the `multiagent://open?agent=...` deep link with a restricted agent id and derive a same-origin Remote route
- APK downloads require the same login/approval check as session APIs, use a fixed server-side file path, are never service-worker cached, and are sent with attachment, no-store, and nosniff headers.
- Even if a Company renderer is compromised, main re-blocks Remote·Tunnel calls in the disabled command set.

## Setup Order

1. In Standard app Settings → **Remote PWA**, enter the GitHub Client ID and Owner, then save.
2. **Start** the local Remote server.
3. **Start tunnel** to issue an HTTPS address. First run may take a while due to the cloudflared download.
4. Open the HTTPS address on your phone and log in with GitHub.
5. If not the Owner, approve the approval request on the desktop.
6. Use either client:
   - Browser: choose **Install app / Add to Home Screen** and tap the notification button. The success message must say that background notifications are enabled. HTTPS is required away from localhost; on iPhone/iPad, Web Push requires a Home Screen-installed PWA
   - Android: tap the `APK` button in the Remote top bar, install the downloaded file, enter the same HTTPS tunnel URL, complete the existing GitHub login/approval flow, then tap the notification button and grant Android notification permission. Keep the required “MultiAgent monitoring” notification active while background delivery is wanted; tap the Remote notification button again to stop the service and revoke its token.

After connecting, desktop/tablet Remote opens the first available **Screen**, while phone-width Remote opens an active **Session** directly and does not list Screens. Existing mobile `?screen=` URLs are normalized to `?agent=` using a session from that Screen. **Documents** and **Usage** remain the fallbacks. The desktop-oriented Monitor overview and global status cards are intentionally omitted, and the mobile bottom bar switches between Sessions, Documents, and Usage so the selected content can use the full dynamic viewport.

Background delivery requires the desktop MultiAgent process, Remote tunnel/server, phone network, and Android Foreground Service to remain available. Closing all desktop workspace windows is fine because the system tray keeps hooks and delivery alive; choosing **Exit** from the tray stops delivery. Force-stopping the Android app or stopping its ongoing monitor notification also stops delivery.

The Usage tab's token cards use the desktop PC's calendar boundaries: today begins at local midnight, the week begins Monday, and the month begins on day one. Its chart always covers the latest 30 calendar days and keeps inactive days as zero-value columns. These aggregates come only from locally indexed `usage.db` events; SSH session accounting remains unsupported. The account section emphasizes the amount **remaining** even though provider APIs report `used_percent`. Codex values come from recent local Codex transcript rate-limit metadata; Claude values come from Claude Code's local OAuth usage endpoint. A provider can therefore be absent until its local session/credential has supplied a snapshot. The refresh button requests current values, while the server protects the upstream check with a 30-second throttle.

Document browsing is local-project only. SSH project files are not transferred in this version. Sandboxed HTML previews can inline project-local CSS and image references, but scripts, external navigation privileges, fonts, and arbitrary binary assets remain unavailable.

## Native Android Client

The Android client lives in `mobile/` and intentionally reuses the Remote PWA rather than duplicating its chat, terminal, authentication, attachment, and document logic. The app permits plain HTTP only for loopback, the Android emulator host, and private IPv4 addresses; public endpoints must use HTTPS. Navigation stays inside the configured Remote origin and GitHub authentication pages, while unrelated web links open in the system browser.

The saved endpoint reconnects on the next launch. To change it, expand the thin native connection bar and tap the settings button. The current prototype APK targets Android 7.0 or later and ARM64 devices. The download button is hidden inside the native app itself because it is intended for browser/PWA users who have not installed the app yet.

The APK does not need Play Store registration and can continue to be sideloaded from the authenticated Remote download. Background monitoring uses only the user's MultiAgent Remote server and requires no Firebase/FCM/Expo account or vendor key. Release signing material is injected locally and is never committed. See `docs/BUILD.md` for the APK generation and desktop bundling flow.

## Remaining Extensions

- Foreground monitor connection diagnostics and explicit per-device management UI
- Server→PWA delta stream or WebSocket to remove browser state polling
- Explicit control APIs like session pause/resume
- Sync interval adjustment based on network/battery state
