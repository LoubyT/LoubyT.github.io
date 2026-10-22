/* Service worker
 *  - data.enc: NETWORK-FIRST (bypasses HTTP cache), falls back to the last good copy offline.
 *  - app shell: CACHE-FIRST. Bump CACHE below whenever index.html/app.js/styles.css/icons change,
 *    so phones pick up the new version. Install skipWaiting()s and activate clients.claim()s; the page (app.js) then
 *    reloads itself on controllerchange, and checks for a new sw.js on start, on foreground and on refresh.
 */
const CACHE = 'fd-shell-v13';
const DATA_CACHE = 'fd-data';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'pin-gate.js', 'recur.js', 'calc.js', 'logos.js', 'manifest.webmanifest', 'logos/youtube.svg', 'logos/netflix.svg', 'logos/att.svg', 'logos/google.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
const DATA_FILES = ['data.enc'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('fd-') && k !== CACHE && k !== DATA_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const file = url.pathname.split('/').pop();

  if (DATA_FILES.includes(file)) {
    const key = new Request(url.origin + url.pathname); // ignore the cache-busting ?t=
    e.respondWith(
      fetch(e.request.url, { cache: 'no-store' }).then((r) => {
        if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(DATA_CACHE).then((c) => c.put(key, copy))); }
        return r;
      }).catch(() => caches.open(DATA_CACHE).then((c) => c.match(key)).then((r) => r || Response.error()))
    );
    return;
  }

  // app shell: cache-first, then network (and cache what we fetch)
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true }).then((hit) => hit ||
      fetch(e.request).then((r) => { if (r.ok && r.type === 'basic') c.put(e.request, r.clone()); return r; })
        .catch(() => (e.request.mode === 'navigate' ? c.match('index.html') : Response.error()))))
  );
});
