/* One-line switch. Leave enabled false until Louby says Publish.
 * endpoint stays null so the old notebook poll never runs.
 * Flip enabled to true only after the worker is the one you checked.
 */
(function (root) {
  if (root.ElfLiveConfig) return;
  root.ElfLiveConfig = {
    enabled: false,
    worker: 'https://elf-hq-room.louby-trahan.workers.dev',
    session: 'https://fd-refresh-relay.vercel.app/api/elf-session',
    endpoint: null,
    fast: false,
    pollMs: 0
  };
})(typeof window !== 'undefined' ? window : globalThis);
