/**
 * The People System — Portal Service Worker
 *
 * Strategy:
 * - STATIC ASSETS (JS, CSS, fonts, images): Cache-first with network fallback.
 *   These are fingerprinted by Next.js so stale cache is impossible.
 * - NAVIGATION (HTML pages): Stale-while-revalidate.
 *   Serve cached page instantly, update in background for next visit.
 *   First visit always hits network. Auth is server-managed so stale
 *   HTML is safe — middleware redirects if session is expired.
 * - API REQUESTS: Network-only. Never cached.
 *   Prevents leaking authenticated data into the cache.
 *
 * Security considerations:
 * - No opaque responses cached (prevents cross-origin data leaks)
 * - Cache cleared on service worker update (version bump)
 * - API routes explicitly excluded from caching
 * - Auth cookies are never intercepted or modified
 */

const CACHE_NAME = 'tps-portal-v2';
const OFFLINE_URL = '/offline';

// Static asset patterns to cache (fingerprinted by Next.js)
const CACHEABLE_EXTENSIONS = /\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|ico|webp)(\?.*)?$/i;

// Never cache these paths
const NEVER_CACHE = [
  '/api/',
  '/auth/',
  '/supabase/',
  '/_next/data/', // Next.js data fetches (JSON — may contain user data)
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.add(OFFLINE_URL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((path) => url.pathname.startsWith(path))) return;

  // Navigation requests — stale-while-revalidate
  // Serve cached page instantly, fetch fresh version in background
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // Offline — serve cached page or offline fallback
          return cached || caches.match(OFFLINE_URL);
        });

        // If we have a cached version, serve it immediately
        // The background fetch updates the cache for next time
        return cached || networkFetch;
      })
    );
    return;
  }

  // Static assets — cache-first with network fallback
  if (CACHEABLE_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          if (
            response.status === 200 &&
            response.type !== 'opaque' &&
            request.method === 'GET'
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else — network only
});
