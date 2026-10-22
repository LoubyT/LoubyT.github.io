// Bump VERSION whenever app files change so phones pick up the update.
const VERSION = 'deals-v9';
// The OCR engine (~7 MB) is NOT precached. It is cached on first use, in its own
// cache that survives app updates (bump only when vendor/tesseract changes).
const OCR_CACHE = 'deals-ocr-tesseract7';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'match.js', 'import.js', 'pin-gate.js', 'savings-boot.js', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // only this app's old caches: /family-dashboard and /stonks share this origin and keep theirs
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('deals-') && k !== VERSION && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // OCR engine files never change for a given version: cache first.
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(
      caches.open(OCR_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) c.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

  // Encrypted data: never from the HTTP cache (still network first, cached copy only when offline)
  if (url.pathname.endsWith('/usuals.enc')) {
    e.respondWith(fetch(req.url, { cache: 'no-store' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(url.origin + url.pathname, copy)); }
      return res;
    }).catch(() => caches.match(url.origin + url.pathname).then((r) => r || Response.error())));
    return;
  }

  // App files: network first (so updates show up), falling back to cache when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
