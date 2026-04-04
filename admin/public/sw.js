/**
 * The People System — Admin Service Worker
 *
 * Same strategy as the portal service worker:
 * - Static assets: cache-first (fingerprinted, safe to cache)
 * - Navigation: network-first with offline fallback
 * - API/auth/data: never cached (security)
 */

const CACHE_NAME = 'tps-admin-v1';
const OFFLINE_URL = '/offline';

const CACHEABLE_EXTENSIONS = /\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|ico|webp)(\?.*)?$/i;

const NEVER_CACHE = [
  '/api/',
  '/auth/',
  '/supabase/',
  '/_next/data/',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((path) => url.pathname.startsWith(path))) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (CACHEABLE_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200 && response.type !== 'opaque' && request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});
