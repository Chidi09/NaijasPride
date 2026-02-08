const STATIC_CACHE = "np-static-v1";
const RUNTIME_CACHE = "np-runtime-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (requestUrl) =>
  requestUrl.pathname.startsWith("/assets/") ||
  requestUrl.pathname.endsWith(".js") ||
  requestUrl.pathname.endsWith(".css") ||
  requestUrl.pathname.endsWith(".png") ||
  requestUrl.pathname.endsWith(".jpg") ||
  requestUrl.pathname.endsWith(".jpeg") ||
  requestUrl.pathname.endsWith(".webp") ||
  requestUrl.pathname.endsWith(".svg") ||
  requestUrl.pathname.endsWith(".woff2");

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;

  if (!sameOrigin) return;

  // App shell for navigations (network-first, fallback to index).
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put("/index.html", cloned));
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Static asset cache (stale-while-revalidate).
  if (isStaticAsset(requestUrl)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            const cloned = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, cloned));
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      }),
    );
    return;
  }

  // Runtime requests (network-first with cache fallback).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const cloned = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, cloned));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
