// Stonks service worker (scope: this folder only).
// - Only same-origin requests inside this folder are handled; the quote relay and
//   ../family-dashboard/wrapped-key.json always go straight to the network.
// - data.enc and page loads are network-first (falls back to the last good copy offline).
// - Other files are cache-first.
const PREFIX = 'vest-';
const CACHE = PREFIX + 'v11';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon.svg'];
const SCOPE = new URL('./', self.location).href;
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // only remove this app's old caches; other apps on the same site keep theirs
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const netFirst = (e, req, key) => e.respondWith(fetch(req, { cache: 'no-store' }).then(res => {
  if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(key, copy))); }
  return res;
}).catch(() => caches.open(CACHE).then(c => c.match(key)).then(r => r || Response.error())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  const path = new URL(req.url).pathname;
  if (req.mode === 'navigate') return netFirst(e, req, './index.html');
  if (path.endsWith('/data.enc')) return netFirst(e, req, './data.enc');
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy))); }
    return res;
  })));
});
