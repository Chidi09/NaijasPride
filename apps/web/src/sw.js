const STATIC_CACHE = "np-static-v1";
const RUNTIME_CACHE = "np-runtime-v1";
const OFFLINE_CACHE = "np-offline-v1";   // movies
const MANGA_CACHE   = "np-manga-v1";     // manga chapter pages
const BOOK_CACHE    = "np-books-v1";     // book files (PDF/EPUB)

const OFFLINE_URL_PREFIX = "/offline/movie/";
const MANGA_URL_PREFIX   = "/offline/manga/";
const BOOK_URL_PREFIX    = "/offline/book/";

const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

const KEEP_CACHES = new Set([STATIC_CACHE, RUNTIME_CACHE, OFFLINE_CACHE, MANGA_CACHE, BOOK_CACHE]);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !KEEP_CACHES.has(key))
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

  // ── Offline video: cache-only ─────────────────────────────────────────────
  if (sameOrigin && requestUrl.pathname.startsWith(OFFLINE_URL_PREFIX)) {
    event.respondWith(
      caches.open(OFFLINE_CACHE).then((cache) =>
        cache.match(requestUrl.pathname).then((cached) => {
          if (cached) return cached;
          return new Response("Offline video not found. Please re-download.", {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        })
      )
    );
    return;
  }

  // ── Offline manga pages: cache-only ───────────────────────────────────────
  if (sameOrigin && requestUrl.pathname.startsWith(MANGA_URL_PREFIX)) {
    event.respondWith(
      caches.open(MANGA_CACHE).then((cache) =>
        cache.match(requestUrl.pathname).then((cached) => {
          if (cached) return cached;
          return new Response("Manga page not cached. Please re-download this chapter.", {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        })
      )
    );
    return;
  }

  // ── Offline books: cache-only ─────────────────────────────────────────────
  if (sameOrigin && requestUrl.pathname.startsWith(BOOK_URL_PREFIX)) {
    event.respondWith(
      caches.open(BOOK_CACHE).then((cache) =>
        cache.match(requestUrl.pathname).then((cached) => {
          if (cached) return cached;
          return new Response("Book not cached. Please re-download.", {
            status: 404,
            headers: { "Content-Type": "text/plain" },
          });
        })
      )
    );
    return;
  }

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

const parsePushPayload = (event) => {
  if (!event.data) {
    return null;
  }

  try {
    return event.data.json();
  } catch {
    return { notification: { title: "NaijasPride", body: event.data.text() } };
  }
};

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event) || {};
  const notification = payload.notification || payload.data || {};

  const title = notification.title || "NaijasPride";
  const body = notification.body || "You have a new update.";
  const icon = notification.icon || "/assets/icons/android-chrome-192x192.png";
  const badge = notification.badge || "/assets/icons/android-chrome-192x192.png";
  const url = notification.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
