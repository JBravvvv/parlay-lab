/* Parlay Lab service worker — caches the app shell so it opens instantly and
   works offline once installed. Bump CACHE when you change any shell asset. */
const CACHE = 'parlay-lab-v16';
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

  // The app shell (the page itself + the prompt files) is served NETWORK-FIRST so an
  // online open always gets the newest build; the cache is only an offline fallback.
  // This is what stops installed apps from getting stuck on a stale build.
  const isShell = req.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/')
    || url.pathname.indexOf('/prompts/') !== -1;
  if (isShell) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Other assets (icons, manifest): cache-first, then network.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => Promise.reject('offline'));
    })
  );
});
