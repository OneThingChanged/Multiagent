const CACHE_NAME = "multiagent-remote-v21";
const STATIC_ASSETS = [
  "/",
  "/pwa/styles.css",
  "/pwa/app.js",
  "/pwa/xterm.js",
  "/pwa/xterm.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  // App shell (our own code) changes on every release — go network-first so a
  // new build lands immediately instead of being pinned to a stale cache.
  // Vendor/static assets (xterm, icons) stay cache-first for speed.
  const isAppShell = url.pathname === "/pwa/app.js" || url.pathname === "/pwa/styles.css";
  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const agentId = event.notification.data?.agentId || null;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients[0];
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "open-agent", agentId });
        return;
      }
      const target = agentId ? `/?agent=${encodeURIComponent(agentId)}` : "/";
      await self.clients.openWindow(target);
    })
  );
});
