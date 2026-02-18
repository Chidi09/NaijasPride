const CACHE_VERSION = 'v3';

const STATIC_CACHE = `np-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `np-runtime-${CACHE_VERSION}`;
const OFFLINE_CACHE = 'np-offline-v1';
const MANGA_CACHE = 'np-manga-v1';
const BOOK_CACHE = 'np-books-v1';

const OFFLINE_URL_PREFIX = '/offline/movie/';
const MANGA_URL_PREFIX = '/offline/manga/';
const BOOK_URL_PREFIX = '/offline/book/';

const MAX_STATIC_ENTRIES = 180;
const MAX_RUNTIME_ENTRIES = 240;

const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

const KEEP_CACHES = new Set([STATIC_CACHE, RUNTIME_CACHE, OFFLINE_CACHE, MANGA_CACHE, BOOK_CACHE]);
const HASHED_ASSET_RE = /\.[a-f0-9]{8,}\./i;

const isStaticAsset = (requestUrl) =>
  requestUrl.pathname.startsWith('/assets/') ||
  requestUrl.pathname.endsWith('.js') ||
  requestUrl.pathname.endsWith('.css') ||
  requestUrl.pathname.endsWith('.png') ||
  requestUrl.pathname.endsWith('.jpg') ||
  requestUrl.pathname.endsWith('.jpeg') ||
  requestUrl.pathname.endsWith('.webp') ||
  requestUrl.pathname.endsWith('.svg') ||
  requestUrl.pathname.endsWith('.woff2');

const trimCache = async (cacheName, maxEntries) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  const protectedPaths = new Set(APP_SHELL);
  const prunable = keys.filter((key) => !protectedPaths.has(new URL(key.url).pathname));
  const overflow = Math.max(0, keys.length - maxEntries);
  const deletions = prunable.slice(0, overflow).map((key) => cache.delete(key));
  await Promise.all(deletions);
};

const putWithLimit = async (cacheName, request, response, maxEntries) => {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  await trimCache(cacheName, maxEntries);
};

const cacheOnlyOffline = (cacheName, requestPath, missMessage) =>
  caches.open(cacheName).then((cache) =>
    cache.match(requestPath).then((cached) => {
      if (cached) return cached;
      return new Response(missMessage, {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }),
  );

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !KEEP_CACHES.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;

  if (sameOrigin && requestUrl.pathname.startsWith(OFFLINE_URL_PREFIX)) {
    event.respondWith(cacheOnlyOffline(OFFLINE_CACHE, requestUrl.pathname, 'Offline video not found. Please re-download.'));
    return;
  }

  if (sameOrigin && requestUrl.pathname.startsWith(MANGA_URL_PREFIX)) {
    event.respondWith(cacheOnlyOffline(MANGA_CACHE, requestUrl.pathname, 'Manga page not cached. Please re-download this chapter.'));
    return;
  }

  if (sameOrigin && requestUrl.pathname.startsWith(BOOK_URL_PREFIX)) {
    event.respondWith(cacheOnlyOffline(BOOK_CACHE, requestUrl.pathname, 'Book not cached. Please re-download.'));
    return;
  }

  if (!sameOrigin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          void putWithLimit(STATIC_CACHE, '/index.html', cloned, MAX_STATIC_ENTRIES);
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (isStaticAsset(requestUrl)) {
    const isHashed = HASHED_ASSET_RE.test(requestUrl.pathname);

    if (isHashed) {
      event.respondWith(
        caches.match(event.request).then((cached) => {
          if (cached) {
            const networkFetch = fetch(event.request)
              .then((response) => {
                if (response && response.ok) {
                  void putWithLimit(STATIC_CACHE, event.request, response.clone(), MAX_STATIC_ENTRIES);
                }
                return response;
              })
              .catch(() => undefined);
            void networkFetch;
            return cached;
          }

          return fetch(event.request).then((response) => {
            if (response && response.ok) {
              void putWithLimit(STATIC_CACHE, event.request, response.clone(), MAX_STATIC_ENTRIES);
            }
            return response;
          });
        }),
      );
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            void putWithLimit(STATIC_CACHE, event.request, response.clone(), MAX_STATIC_ENTRIES);
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          void putWithLimit(RUNTIME_CACHE, event.request, response.clone(), MAX_RUNTIME_ENTRIES);
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

const parsePushPayload = (event) => {
  if (!event.data) return {};

  try {
    return event.data.json();
  } catch {
    return { notification: { title: 'NaijasPride', body: event.data.text() } };
  }
};

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const notification = payload.notification || {};
  const data = payload.data || notification.data || {};

  const title = notification.title || data.title || 'NaijasPride';
  const body = notification.body || data.body || 'You have a new update.';
  const icon = notification.icon || '/assets/icons/android-chrome-192x192.png';
  const badge = notification.badge || '/assets/icons/android-chrome-192x192.png';
  const image = notification.image || data.imageUrl;
  const url = data.url || notification.click_action || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      image,
      data: { url },
      tag: data.event || undefined,
      renotify: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        const sameOriginWindow = client.url.startsWith(self.location.origin);
        if (!sameOriginWindow || !('focus' in client)) continue;
        if ('navigate' in client) {
          client.navigate(targetUrl);
        }
        return client.focus();
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
