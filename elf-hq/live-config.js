/* Public switch for the private relay. endpoint stays null until Louby deploys it.
 * fast:true polls about every two seconds and can use up the free Blob allowance.
 */
(function (root) {
  if (root.ElfLiveConfig) return;
  root.ElfLiveConfig = {
    endpoint: null,
    fast: false,
    pollMs: 2000
  };
})(typeof window !== 'undefined' ? window : globalThis);
