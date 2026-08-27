# MultiAgent Mobile

Android client shell for the desktop MultiAgent Remote service. The native app
stores multiple approved PC profiles and loads the selected PC's mobile-first
Remote PWA in a constrained WebView. Registered PCs can keep independent
background monitor connections while only one WebView is visible. The launch
screen merges privacy-safe session metadata from every registered PC into one
native Session Hub; selecting a session opens the matching Remote profile.

## Development

```powershell
npm install
npm test
npm start
```

Metro uses port `4430` to avoid the desktop client's port `4420`.

## Android APK

The first native generation needs JDK 17, Android SDK Platform 36, Android NDK
27.1.12297006, and CMake 3.22.1:

```powershell
npm run signing:setup
npm run prebuild:android
npm run apk
```

The generated ARM64 Release APK is written to
`android/app/build/outputs/apk/release/app-release.apk` and supports Android 7.0
or later. `npm run apk` requires the protected project release keystore and
refuses to fall back to debug signing. `npm run apk:verify` is compile-only and
must never be published. Play Store distribution additionally requires an AAB
upload pipeline, but sideloaded release APKs do not require a store listing.

Copy `mobile/.env.example` to the ignored `mobile/.env.signing.local`, replace its one
password value, and run `npm run signing:setup` once. The setup creates the external
keystore and local public metadata used automatically by the standard desktop build.
Its packaging guard verifies the
signature, package id, non-debuggable manifest, and ARM64 ABI, then stages the
APK outside `app.asar`. APK binaries and signing credentials are never tracked
in Git. Approved Remote browser users then see an `APK` button in the top bar.

## Connection

1. Desktop MultiAgent → Settings → Remote.
2. Start the Remote server and HTTPS tunnel.
3. Enter a PC name and its HTTPS tunnel URL in the mobile app.
4. Complete the existing GitHub device login and desktop approval flow.
5. Return to the Session Hub, open `서버 설정`, and add another PC. Login,
   approval, session access, and notification enablement are completed
   independently for each PC.

Quick Tunnel URLs can change after a restart. A named Cloudflare tunnel is
recommended for a persistent mobile endpoint.

The app accepts plain HTTP only for loopback, the Android emulator host, and
private IPv4 addresses. Public Remote endpoints must use HTTPS. Registered
profiles and the last selected PC are restored automatically on the next
launch. The app opens the combined Session Hub by default. Use `서버 설정` to
add, rename-by-readding, or delete a PC; opening a server directly remains
available when login or desktop approval is required.

Each PC WebView is created lazily the first time that profile is opened and is
kept mounted while the APK stays alive. Returning to the Session Hub or opening
another PC therefore preserves that profile's authenticated page, scroll state,
and WebView navigation history without mixing origins. Android Back first walks
the active WebView's own history and then returns to the native Session Hub. A
deleted profile immediately destroys its retained WebView and revokes its native
access tokens. A full app process restart intentionally starts from the Session
Hub and creates fresh WebViews while normal protected login cookies remain
subject to the server's expiration policy.

## Multi-PC Session Hub

After an approved Remote page loads in the APK, it issues a separate revocable
mobile session token. The APK stores it with Android Keystore and queries all
registered PCs in parallel only when the hub opens or the user refreshes it.
There is no periodic background polling for the hub.

The dedicated endpoint exposes only the session id, alias, project, AI tool,
activity state, and active flag. Terminal output, chat history, prompts,
attachments, file paths, and input APIs are not exposed. Browser requests are
rejected on this bearer-token endpoint. Deleting a server profile revokes both
its native session token and its optional notification-monitor token.

## Background monitoring

The APK does not use Firebase, FCM, Expo Push, or an external notification
account. After GitHub login and desktop approval, tapping the Remote notification
button issues a revocable notification-only token and starts an Android
`remoteMessaging` Foreground Service. Android displays an ongoing “MultiAgent
monitoring” notification while the service independently long-polls every PC
whose native notification button was enabled. Completion/question events
include the profile name and create privacy-safe local notifications; tapping
one switches to the matching PC and opens its Session.

The desktop stores only the token SHA-256 hash in
`remote-monitor-devices.json`; the APK encrypts the raw token with Android
Keystore as an encrypted per-PC list. Logging out or disabling notifications
removes only that PC's monitor token; the service continues while another PC
remains enabled. Revoking a Remote account removes every device token for that
login on that PC. Force-stopping the app
or stopping it from Android's active-app controls stops background delivery until
the user enables it again. Tapping the enabled notification button in Remote also stops the service
and revokes that PC's token. Deleting a profile also revokes its stored token.
