# MultiAgent Mobile

Android client shell for the desktop MultiAgent Remote service. The native app
stores one approved Remote URL and loads the existing mobile-first Remote PWA
in a constrained WebView.

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
3. Enter the HTTPS tunnel URL in the mobile app.
4. Complete the existing GitHub device login and desktop approval flow.

Quick Tunnel URLs can change after a restart. A named Cloudflare tunnel is
recommended for a persistent mobile endpoint.

The app accepts plain HTTP only for loopback, the Android emulator host, and
private IPv4 addresses. Public Remote endpoints must use HTTPS. The last valid
address is restored automatically on the next launch; expand the thin native
connection bar and use the settings button to change it.

## Background monitoring

The APK does not use Firebase, FCM, Expo Push, or an external notification
account. After GitHub login and desktop approval, tapping the Remote notification
button issues a revocable notification-only token and starts an Android
`remoteMessaging` Foreground Service. Android displays an ongoing “MultiAgent
monitoring” notification while the service long-polls the user's own Remote
endpoint. Completion/question events create privacy-safe local notifications;
tapping one opens the matching Session.

The desktop stores only the token SHA-256 hash in
`remote-monitor-devices.json`; the APK encrypts the raw token with Android
Keystore. Logging out stops the service and revokes the token, and revoking the
Remote account removes every device token for that login. Force-stopping the app
or stopping it from Android's active-app controls stops background delivery until
the user enables it again. Tapping the enabled notification button in Remote also stops the service
and revokes its current token.
