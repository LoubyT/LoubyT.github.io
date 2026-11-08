/* Public switch for the private relay. endpoint stays null until a wake
 * channel exists that is not the PIN Blob store. fast must stay false:
 * a 2 second poll of that store would pass the Hobby read cap and can
 * freeze PIN unlock for every app on the project.
 */
(function (root) {
  if (root.ElfLiveConfig) return;
  root.ElfLiveConfig = {
    endpoint: null,
    fast: false,
    pollMs: 2000
  };
})(typeof window !== 'undefined' ? window : globalThis);
