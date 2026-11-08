/* Loaded only by staging.html. The public book does not include this file.
 * enabled is true here so a PIN on https://www.louby.net can reach the worker.
 * Leave live-config.js enabled false.
 */
(function (root) {
  root.ElfLiveConfig = {
    enabled: true,
    worker: 'https://elf-hq-room.louby-trahan.workers.dev',
    session: 'https://fd-refresh-relay.vercel.app/api/elf-session',
    endpoint: null,
    fast: false,
    pollMs: 0
  };
})(typeof window !== 'undefined' ? window : globalThis);
