/* Parlay Lab service worker — caches the app shell so it opens instantly and
   works offline once installed. Bump CACHE when you change any shell asset. */
const CACHE = 'parlay-lab-v10';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Only manage our own origin. Live data (MLB Stats API, The Odds API, the
  // Claude API), ESPN logos and Google Fonts go straight to the network and
  // fail gracefully offline.
  if (url.origin !== location.origin) return;

  // The Sharp's system prompt must never be served stale: network-first,
  // fall back to the last cached copy offline.
  if (url.pathname.indexOf('/prompts/') !== -1) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // App shell: cache-first, then network; fall back to index.html for navigations.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Promise.reject('offline')));
    })
  );
});
