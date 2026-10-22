/* louby.net/savings — PIN gate + encrypted usuals.
 * The family's usual Walmart products (data/usuals.enc) are AES-GCM encrypted with the family data key.
 * The key comes from the shared 4-digit PIN (pin-gate.js → relay), is kept in memory only, and the app code
 * (match.js, app.js) loads only after it opens. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
  var AAD = new TextEncoder().encode('savings:data:v1');
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error(src)); }; document.body.appendChild(s); });
  }
  PinGate.start({
    title: 'Deals', icon: 'icons/icon-192.png', theme: 'light', lockCorner: true,
    onKey: async function (key, kid) {
      var r = await fetch('data/usuals.enc?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('usuals ' + r.status);
      var env = await r.json();
      if (env.kid !== kid) { var e = new Error('kid'); e.code = 'KID'; throw e; }
      var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv), additionalData: AAD }, key, b64(env.ct));
      var j = JSON.parse(new TextDecoder().decode(pt));
      window.__dealUsuals = j.items || j.usuals || [];
      await loadScript('match.js');
      await loadScript('app.js');
    },
  });
})();
