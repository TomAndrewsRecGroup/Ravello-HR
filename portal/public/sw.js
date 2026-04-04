/**
 * The People System — Portal Service Worker
 *
 * Strategy:
 * - STATIC ASSETS (JS, CSS, fonts, images): Cache-first with network fallback.
 *   These are fingerprinted by Next.js so stale cache is impossible.
 * - NAVIGATION (HTML pages): Network-first with offline fallback.
 *   Never serve cached HTML — it may contain stale auth state.
 * - API REQUESTS: Network-only. Never cached.
 *   Prevents leaking authenticated data into the cache.
 *
 * Security considerations:
 * - No opaque responses cached (prevents cross-origin data leaks)
 * - Cache cleared on service worker update
 * - API routes explicitly excluded from caching
 * - Auth cookies are never intercepted or modified
 */

const CACHE_NAME = 'tps-portal-v1';
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
      // Pre-cache the offline page only
      return cache.add(OFFLINE_URL);
    })
  );
  // Activate immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      // Delete old cache versions
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never intercept API, auth, or data routes
  if (NEVER_CACHE.some((path) => url.pathname.startsWith(path))) return;

  // Navigation requests (HTML pages) — network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL);
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
          // Only cache successful, same-origin, non-opaque responses
          if (
            response.status === 200 &&
            response.type !== 'opaque' &&
            request.method === 'GET'
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else — network only (no caching)
});
