const CACHE_NAME = "kue-shell-v6";
const STATIC_SHELL_URLS = [
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_SHELL_URLS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache authentication, admin, or private social/notification routes
  if (
    url.pathname === "/login" ||
    url.pathname === "/register" ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/social") ||
    url.pathname.startsWith("/notifications") ||
    url.pathname.startsWith("/u/") ||
    url.pathname.startsWith("/api/profile/") ||
    url.pathname.startsWith("/api/notifications")
  ) {
    return;
  }

  // Network-first for document navigations so fresh data loads when online,
  // falling back to the last cached response when offline inside a venue.
  if (request.mode === "navigate" || url.pathname.startsWith("/festival-mode")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic" && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ??
            (await caches.match("/festival-mode")) ??
            (await caches.match("/"));
          return (
            cached ??
            new Response("KUE sin conexión. Abre la app con cobertura al menos una vez.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }),
    );
    return;
  }

  // Cache-first for static Next assets and icons
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
