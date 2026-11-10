/* Elf HQ shell only. Network first. Never caches notebooks or pictures.
 * Cache names start with elf-hq- so other apps on this origin keep theirs.
 */
const VERSION = 'elf-hq-v24';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=24',
  './app.js?v=24',
  './plan-model.js?v=24',
  './demo-plan.js?v=24',
  './media-manifest.js?v=24',
  './media-fit.js?v=24',
  './sync-engine.js?v=24',
  './gifts.js?v=24',
  './media-vault.js?v=24',
  './live-config.js?v=24',
  './pin-screen.js?v=24',
  './scene-art.js?v=24',
  './sync-port.js?v=24',
  './monitor-contract.js?v=24',
  './scratchpad.js?v=24',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('elf-hq-') && key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.includes('/elf-hq/')) return;
  if (url.pathname.includes('/media/') || url.pathname.endsWith('/manifest.enc.json')) return;
  event.respondWith(
    fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
