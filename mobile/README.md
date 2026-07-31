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
npm run prebuild:android
npm run apk
```

The generated ARM64 Release APK is written to
`android/app/build/outputs/apk/release/app-release.apk` and supports Android 7.0
or later. The prototype build uses the generated debug signing identity so it
can be installed directly for testing; store distribution requires a dedicated
upload key and an AAB release pipeline.

Copy a verified APK to
`../app/electron/remote-pwa/downloads/MultiAgent-Mobile.apk` before building the
standard desktop installer. Approved Remote browser users then see an `APK`
button in the top bar and can download it directly from their desktop Remote
server.

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
