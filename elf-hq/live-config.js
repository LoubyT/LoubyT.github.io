/* enabled turns the book on. session is the PIN route. worker is the room.
 * endpoint stays null so the old notebook poll never runs.
 */
(function (root) {
  if (root.ElfLiveConfig) return;
  root.ElfLiveConfig = {
    enabled: true,
    worker: 'https://elf-hq-room.louby-trahan.workers.dev',
    session: 'https://fd-refresh-relay.vercel.app/api/elf-session',
    endpoint: null,
    fast: false,
    pollMs: 0
  };
})(typeof window !== 'undefined' ? window : globalThis);
