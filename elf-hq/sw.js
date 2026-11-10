/* Elf HQ shell only. Network first. Never caches notebooks or pictures.
 * Cache names start with elf-hq- so other apps on this origin keep theirs.
 */
const VERSION = 'elf-hq-v13';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './plan-model.js',
  './demo-plan.js',
  './media-manifest.js',
  './media-fit.js',
  './sync-engine.js',
  './gifts.js',
  './media-vault.js',
  './live-config.js',
  './pin-screen.js',
  './scene-art.js',
  './sync-port.js',
  './monitor-contract.js',
  './scratchpad.js',
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
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
