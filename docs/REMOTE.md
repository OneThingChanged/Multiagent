# Remote PWA

A Standard-only mobile remote for checking desktop MultiAgent sessions from a phone/tablet, giving short commands, and viewing local project Markdown/HTML documents. On Electron apps 0.5.31+, `app/electron/services/web-services.mjs` provides the server and `app/electron/remote-pwa/` provides the shared mobile UI. That UI can be opened in a browser/PWA or through the native Android shell under `mobile/`.

Company builds hide the Remote tab in Settings, reject Remote·Tunnel commands in main IPC, and exclude `electron/remote-pwa/**` from packaging.

## Overall Flow

```text
[Phone PWA / Android app] ──HTTPS──> Cloudflare Tunnel ──> [My PC] 127.0.0.1:<port>
           │                                                       │
           ├─ GitHub login + account approval                      ├─ session/hook/recent output query
           ├─ Markdown/HTML document browser                       ├─ sandboxed local project document read
           ├─ bounded image attachment upload                      ├─ attachment saved under app data
           ├─ status/question/completion alerts                    └─ short input to the selected PTY
           └─ PWA install or native Android shell
```

The Remote server does not listen on an external NIC; it binds to loopback only. Phone access uses the HTTPS tunnel URL. The local URL is for preview/diagnostics on the desktop PC.

## Remote Screen Layout

- **Monitor**: separates working · needs-answer · done · waiting · inactive sessions into lanes, with status counts at a glance
- **Screens**: read-only sync of the desktop's split Screens and pane/tab layouts. Desktop can show every pane; mobile uses pane tabs and streams only the selected terminal
- **Sessions**: per-project session list with status filters and search; the selected session opens in a compact full-height chat/terminal view with a keyboard-safe composer
- **Documents**: choose a local project, search its `.md`/`.markdown`/`.html`/`.htm` files, then open a rendered preview. Markdown supports headings, lists, task items, tables, code fences, and relative links to another listed document. HTML runs in a script-disabled sandbox iframe
- **Usage**: a dedicated account-limit view for Codex and Claude. It shows the remaining percentage for each rolling window, reset time, plan, extra-usage availability, and the oldest provider refresh time
- **Android app**: stores one approved Remote endpoint and loads the same PWA in a constrained native WebView. Its connection bar starts collapsed so the chat/terminal keeps nearly the full screen; expand it for back, reload, or address change
- **APK download**: after login and desktop approval, the top bar shows an `APK` button when the desktop build contains `app/electron/remote-pwa/downloads/MultiAgent-Mobile.apk`. The Remote server streams that file directly and supports interrupted-download resume
- Mobile Screens switch to pane tabs instead of small splits, navigation lists appear as a slide menu, and non-monitor views reclaim the status-summary space
- Session detail automatically collapses the fixed left navigation at tablet/small-desktop widths (up to 1180px). In this focus layout the global header is removed, and a single compact row contains the navigation button, session name/status, and Chat/Terminal switch
- Session detail defaults to parsed Codex/Claude chat and can switch to the live xterm terminal. Windows extended transcript paths (`\\?\C:\...`) are normalized before transcript reads
- Session chat and terminal modes keep only image attachment + one-line message input + Send in one compact row. Mobile also hides the global top bar and duplicate request/question panels and compacts its header/mode switch
- For local sessions, the attachment button accepts up to four PNG/JPEG/GIF/WebP/BMP files per draft. Each image is uploaded to the host app (8MB maximum), previewed/removable before send, and its host path is appended to the selected session message. SSH sessions disable this button because the remote shell cannot read a path on the host PC
- On phones/tablets, one-finger vertical drags scroll the live terminal. Normal buffers move through xterm scrollback; alternate-screen TUIs receive wheel/PageUp/PageDown input. Pinch zoom and link taps remain available
- Latest user request, interactive question, recent terminal output
- Send instructions/question answers to the active session from a Screen pane or Session detail
- `Ctrl/⌘ + Enter` to send, copy recent output
- Browser **Install app / Add to Home Screen** support
- While the PWA is running, completion/new questions appear as service worker notifications
- Offline, only the app shell opens; session API/input are network-only

Screen selection changes only inside the Remote browser and does not change the desktop MultiAgent's current Screen or active session. File editing, screen sharing, and a background Push server are not in the MVP.

## HTTP Endpoints

| path | description |
|---|---|
| `GET /` | PWA main screen for approved users |
| `GET /login` | GitHub web/Device Flow login screen |
| `GET /manifest.webmanifest` | PWA install manifest |
| `GET /sw.js` | offline shell / notification service worker |
| `GET /api/state` | projects, sessions, hooks, recent output state |
| `GET /api/usage?refresh=1` | current Codex/Claude account-limit snapshots. `refresh=1` requests a live refresh and is throttled to once every 30 seconds |
| `POST /api/input` | deliver input to the active PTY. JSON, same-origin, 8KB limit |
| `POST /api/attachment` | save one same-origin image attachment under app data. JSON data URL, 8MB decoded limit |
| `GET /api/stream?id=...` | SSE backfill and live PTY output for the xterm view |
| `GET /api/chat?id=...` | parsed Codex/Claude transcript blocks for the chat view |
| `POST /api/session/restart` | request activation of an inactive session |
| `GET /api/docs?projectId=...` | list up to 500 Markdown/HTML documents under one synchronized local project |
| `GET /api/docs/read?projectId=...&path=...` | read one Markdown/HTML document inside that project (2MB limit) |
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
- Document paths are resolved against a synchronized local project root. Absolute paths, `..` traversal outside the project, symbolic-link escapes, unsupported extensions, files over 2MB, and SSH projects are rejected. Dependency/build/cache folders are skipped while listing.
- Markdown raw HTML is escaped before rendering. HTML previews use an iframe without `allow-scripts` or `allow-same-origin`, so document scripts and parent-window access are blocked.
- PTY input allows same-origin JSON POST only; cross-site requests, wrong Content-Type, empty values, over-8KB, and exited sessions are rejected.
- Image uploads use the same approval and same-origin boundary. The server ignores client file paths, accepts five raster MIME types only, verifies their file signatures, caps decoded files at 8MB, and writes random names under `remote-attachments` in the app data folder.
- PWA responses use strict CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, and a restricted Permissions Policy.
- The service worker caches only the static shell; `/api/**`, `/auth/**`, and all POSTs are never cached.
- Account-limit requests use the same login/approval boundary as session state. The browser receives only normalized percentages, reset times, plan labels, and credit state; local OAuth credentials are never exposed.
- APK downloads require the same login/approval check as session APIs, use a fixed server-side file path, are never service-worker cached, and are sent with attachment, no-store, and nosniff headers.
- Even if a Company renderer is compromised, main re-blocks Remote·Tunnel calls in the disabled command set.

## Setup Order

1. In Standard app Settings → **Remote PWA**, enter the GitHub Client ID and Owner, then save.
2. **Start** the local Remote server.
3. **Start tunnel** to issue an HTTPS address. First run may take a while due to the cloudflared download.
4. Open the HTTPS address on your phone and log in with GitHub.
5. If not the Owner, approve the approval request on the desktop.
6. Use either client:
   - Browser: choose **Install app / Add to Home Screen** and enable notification permission.
   - Android: tap the `APK` button in the Remote top bar, install the downloaded file, enter the same HTTPS tunnel URL, and complete the existing GitHub login/approval flow.

The first screen after connecting is Monitor. Tapping a top status card filters to that status; **SCREENS** on the left opens split screens, **SESSIONS** opens individual sessions, **Documents** opens the local project document browser, and **Usage** opens account limits. On mobile, one combined **Sessions** button opens the sidebar containing both Screens and individual sessions; the one-line bottom bar is Monitor/Sessions/Documents/Usage. Opening any non-monitor view hides the monitor summary so the selected content can use the phone's full dynamic viewport.

The Usage tab emphasizes the amount **remaining** even though provider APIs report `used_percent`. Codex values come from recent local Codex transcript rate-limit metadata; Claude values come from Claude Code's local OAuth usage endpoint. A provider can therefore be absent until its local session/credential has supplied a snapshot. The refresh button requests current values, while the server protects the upstream check with a 30-second throttle.

Document browsing is local-project only. SSH project files and relative HTML assets such as external CSS/images are not transferred in this version; self-contained HTML and inline styles render normally.

## Native Android Client

The Android client lives in `mobile/` and intentionally reuses the Remote PWA rather than duplicating its chat, terminal, authentication, attachment, and document logic. The app permits plain HTTP only for loopback, the Android emulator host, and private IPv4 addresses; public endpoints must use HTTPS. Navigation stays inside the configured Remote origin and GitHub authentication pages, while unrelated web links open in the system browser.

The saved endpoint reconnects on the next launch. To change it, expand the thin native connection bar and tap the settings button. The current prototype APK targets Android 7.0 or later and ARM64 devices. The download button is hidden inside the native app itself because it is intended for browser/PWA users who have not installed the app yet. See `docs/BUILD.md` for local APK generation and desktop bundling.

## Remaining Extensions

- Web Push/VAPID that works even when the browser is fully closed
- Server→PWA delta stream or WebSocket to remove polling
- Explicit control APIs like session pause/resume
- Sync interval adjustment based on network/battery state
