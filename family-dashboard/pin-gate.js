/* pin-gate.js — shared 4-digit PIN screen for the family-dashboard, stonks and savings pages.
 * Source of truth: /workspace/pin-gate/pin-gate.js (copied into each app by its build/deploy step).
 * The PIN is checked by the relay (POST /api/unlock). On the right PIN the relay returns the family data key,
 * which is imported as a NON-extractable CryptoKey. That CryptoKey (never the raw bytes) is kept in IndexedDB
 * ('pin-gate-session') with a FIXED expiry of PIN time + 1 hour, shared by all three pages on this origin: within
 * the hour, reloads and moving between the apps don't ask again. When the hour is up — on load or while a page is
 * open — the stored key is deleted and the page reloads to the PIN pad. The small lock icon locks right away.
 * Lockouts are enforced on the server; this file only shows them.
 *
 *   PinGate.start({ title, icon, theme: 'dark'|'light', onKey: async (cryptoKey, kid) => {...} })
 *   onKey may throw; an error with code 'KID' means the page's data was made with a different key.
 */
(function (root) {
  'use strict';
  var URL_ = 'https://fd-refresh-relay.vercel.app/api/unlock';
  var DEV_KEY = 'pin.device', LOCK_KEY = 'pin.lock';
  var WINDOW_MS = 36e5; // 1 hour, fixed from the PIN entry (not sliding)
  var SDB = 'pin-gate-session', SKEY = 'current';
  var noop = function () {};
  var CSS = [
    '.pg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,system-ui,sans-serif;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;overflow:auto}',
    '.pg.dark{background:radial-gradient(120% 80% at 50% -10%,#1d2340 0,#0b0d14 60%);color:#eef1f8;--pg-mute:#9aa3b8;--pg-key:rgba(255,255,255,.08);--pg-key-on:rgba(255,255,255,.2);--pg-line:rgba(255,255,255,.35);--pg-fill:#fff;--pg-warn:#ff9fae}',
    '.pg.light{background:#F5F4F0;color:#1c1b19;--pg-mute:#6c6a63;--pg-key:rgba(0,0,0,.06);--pg-key-on:rgba(0,0,0,.16);--pg-line:rgba(0,0,0,.35);--pg-fill:#1c1b19;--pg-warn:#b42318}',
    '.pg-box{width:100%;max-width:340px;text-align:center}',
    '.pg-icon{width:64px;height:64px;border-radius:16px;display:block;margin:0 auto 12px}',
    '.pg h1{font-size:22px;font-weight:700;margin:0 0 4px;letter-spacing:-.01em}',
    '.pg-sub{font-size:15px;color:var(--pg-mute);margin:0 0 22px;min-height:20px}',
    '.pg-dots{display:flex;justify-content:center;gap:18px;margin:0 0 14px}',
    '.pg-dots i{width:15px;height:15px;border-radius:50%;border:2px solid var(--pg-line);transition:background .12s,border-color .12s,transform .12s}',
    '.pg-dots i.on{background:var(--pg-fill);border-color:var(--pg-fill);transform:scale(1.08)}',
    '.pg-msg{font-size:15px;line-height:1.4;min-height:42px;margin:0 0 14px;color:var(--pg-mute)}',
    '.pg-msg.warn{color:var(--pg-warn);font-weight:600}',
    '.pg-pad{display:grid;grid-template-columns:repeat(3,76px);gap:16px 26px;justify-content:center}',
    '.pg-pad button{width:76px;height:76px;border-radius:50%;border:0;background:var(--pg-key);color:inherit;font-size:30px;font-weight:500;line-height:1;font-family:inherit;cursor:pointer;touch-action:manipulation;transition:background .08s}',
    '.pg-pad button:active,.pg-pad button.hit{background:var(--pg-key-on)}',
    '.pg-pad button.ghost{background:none;font-size:15px;font-weight:600}',
    '.pg-pad button:disabled{opacity:.35;cursor:default}',
    '.pg-pad .sp{visibility:hidden}',
    '.pg.checking .pg-box{visibility:hidden}',
    '.pg-lock{align-self:center;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border-radius:50%;border:0;background:transparent;color:inherit;opacity:.5;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
    '.pg-lock:hover,.pg-lock:focus-visible{opacity:.9}',
    '.pg-lock svg{width:17px;height:17px;display:block}',
    '.pg-lock.float{position:fixed;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));z-index:50}',
    '.pg-lock.corner{position:absolute;right:max(8px,env(safe-area-inset-right));top:max(8px,env(safe-area-inset-top));z-index:5}',
    '.pg.busy .pg-dots i.on{animation:pgpulse .8s infinite alternate}',
    '.pg.shake .pg-dots{animation:pgshake .4s}',
    '.pg.locked .pg-pad{opacity:.35;pointer-events:none}',
    '@keyframes pgshake{20%,60%{transform:translateX(-10px)}40%,80%{transform:translateX(10px)}}',
    '@keyframes pgpulse{to{opacity:.35}}',
    '@media(max-height:620px){.pg-pad{grid-template-columns:repeat(3,64px);gap:10px 22px}.pg-pad button{width:64px;height:64px;font-size:26px}.pg-icon{display:none}}',
    '@media(prefers-reduced-motion:reduce){.pg.shake .pg-dots,.pg.busy .pg-dots i.on{animation:none}}'
  ].join('\n');

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function deviceId() {
    var id = null;
    try { id = localStorage.getItem(DEV_KEY); } catch (e) {}
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      id = btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { localStorage.setItem(DEV_KEY, id); } catch (e) {}
    }
    return id;
  }
  // session store: { key: non-extractable CryptoKey, kid, exp } under its own DB name (wipeLegacy never touches it)
  function sdb(mode, fn) {
    return new Promise(function (res, rej) {
      var r; try { r = indexedDB.open(SDB, 1); } catch (e) { return rej(e); }
      r.onupgradeneeded = function () { r.result.createObjectStore('s'); };
      r.onerror = function () { rej(r.error); };
      r.onsuccess = function () {
        var db = r.result, q;
        try { var tx = db.transaction('s', mode); q = fn(tx.objectStore('s'));
          tx.oncomplete = function () { db.close(); res(q && q.result); }; tx.onerror = function () { db.close(); rej(tx.error); };
        } catch (e) { db.close(); rej(e); }
      };
    });
  }
  var sGet = function () { return sdb('readonly', function (s) { return s.get(SKEY); }); };
  var sPut = function (v) { return sdb('readwrite', function (s) { return s.put(v, SKEY); }); };
  var sDel = function () { return sdb('readwrite', function (s) { return s.delete(SKEY); }); };
  var bc = null; try { bc = new BroadcastChannel('pin-gate'); } catch (e) {}
  function wipeLegacy() {   // the old long-passcode setup remembered the key in IndexedDB — remove it
    try { ['family-dashboard', 'stonks'].forEach(function (n) { indexedDB.deleteDatabase(n); }); } catch (e) {}
  }
  function fmtLeft(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    if (h) return h + ' h ' + (m < 10 ? '0' : '') + m + ' min';
    return m + ':' + (x < 10 ? '0' : '') + x;
  }

  var started = false;
  function start(o) {
    if (started) return; started = true;
    wipeLegacy();
    var st = el('style'); st.textContent = CSS; document.head.appendChild(st);
    var wrap = el('div', 'pg checking ' + (o.theme === 'light' ? 'light' : 'dark'));
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'pgTitle');
    var box = el('div', 'pg-box');
    if (o.icon) { var im = el('img', 'pg-icon'); im.src = o.icon; im.alt = ''; box.appendChild(im); }
    var h = el('h1', null, o.title || 'Locked'); h.id = 'pgTitle';
    var sub = el('p', 'pg-sub', 'Enter your PIN');
    var dots = el('div', 'pg-dots'); dots.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 4; i++) dots.appendChild(el('i'));
    var msg = el('p', 'pg-msg'); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    var pad = el('div', 'pg-pad');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
    var btn = {};
    keys.forEach(function (k) {
      var b = el('button', k === 'del' ? 'ghost' : k === '' ? 'sp' : null, k === 'del' ? 'Delete' : k);
      b.type = 'button';
      if (k === '') { b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
      if (k === 'del') b.setAttribute('aria-label', 'Delete last digit');
      b.addEventListener('click', function () { press(k); });
      btn[k] = b; pad.appendChild(b);
    });
    box.appendChild(h); box.appendChild(sub); box.appendChild(dots); box.appendChild(msg); box.appendChild(pad);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    document.documentElement.style.overflow = 'hidden';

    var pin = '', busy = false, timer = 0, lockUntil = 0;
    function draw() { var d = dots.children; for (var j = 0; j < 4; j++) d[j].className = j < pin.length ? 'on' : ''; }
    function say(t, warn) { msg.textContent = t || ''; msg.className = 'pg-msg' + (warn ? ' warn' : ''); }
    function shake() { wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake'); if (navigator.vibrate) try { navigator.vibrate(120); } catch (e) {} }
    function setLocked(on) { wrap.classList.toggle('locked', !!on); keys.forEach(function (k) { if (k !== '') btn[k].disabled = !!on; }); }
    function tick() {
      var left = lockUntil - Date.now();
      if (left <= 0) { clearInterval(timer); timer = 0; lockUntil = 0; try { localStorage.removeItem(LOCK_KEY); } catch (e) {} setLocked(false); say('You can try again now.'); return; }
      say((wrap.dataset.kind === 'ip' ? 'Too many wrong PINs from this network. ' : 'Too many wrong PINs. ') + 'Try again in ' + fmtLeft(left) + '.', true);
    }
    function lockFor(untilIso, kind) {
      lockUntil = Date.parse(untilIso) || (Date.now() + 6e4); wrap.dataset.kind = kind;
      try { localStorage.setItem(LOCK_KEY, JSON.stringify({ until: lockUntil, kind: kind })); } catch (e) {}
      setLocked(true); clearInterval(timer); tick(); timer = setInterval(tick, 1000);
    }
    function permanent() {
      clearInterval(timer); setLocked(true);
      say('This phone is locked after too many wrong PINs. It has to be reset before it can open again.', true);
    }
    // show a lockout we already know about (the server still decides)
    try { var saved = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); if (saved && saved.until > Date.now()) lockFor(new Date(saved.until).toISOString(), saved.kind); } catch (e) {}

    function press(k) {
      if (busy || lockUntil) return;
      if (k === 'del') { pin = pin.slice(0, -1); draw(); return; }
      if (!/^\d$/.test(k) || pin.length >= 4) return;
      pin += k; draw();
      if (pin.length === 4) submit();
    }
    async function submit() {
      busy = true; wrap.classList.add('busy'); say('Checking…');
      var p = pin, r = null, j = {};
      try {
        r = await fetch(URL_, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: p, deviceId: deviceId() }) });
        try { j = await r.json(); } catch (e) { j = {}; }
      } catch (e) { r = null; }
      p = null; pin = ''; busy = false; wrap.classList.remove('busy');
      if (!r) { draw(); return say('Can’t reach the lock right now. Check your internet and try again.', true); }
      if (r.status === 200 && j.key) {
        var raw = b64(j.key); j.key = null;
        var key;
        try { key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']); } finally { raw.fill(0); }
        say('Opening…');
        var exp = Date.now() + WINDOW_MS;
        try { await o.onKey(key, j.kid); }
        catch (e) { draw(); return say(e && e.code === 'KID' ? 'This page needs an update. Try again in a few minutes.' : 'Couldn’t open it. Check your internet and try again.', true); }
        try { localStorage.removeItem(LOCK_KEY); } catch (e) {}
        await sPut({ key: key, kid: j.kid, exp: exp }).catch(noop);
        return opened(exp);
      }
      draw(); shake();
      if (r.status === 401) {
        var n = j.triesLeft;
        if (j.finalWarning || n === 1) return say('Wrong PIN. 1 try left before this phone is ' + (j.finalWarning ? 'locked for good.' : 'locked for 1 hour.'), true);
        return say('Wrong PIN. ' + n + ' tries left.', n <= 2);
      }
      if (r.status === 423 && j.state === 'permanent') return permanent();
      if (r.status === 423) return lockFor(j.until, j.state === 'day' ? 'day' : 'hour');
      if (r.status === 429) return lockFor(j.until, 'ip');
      say('Something went wrong (' + r.status + '). Try again in a minute.', true);
    }
    function reveal() { wrap.classList.remove('checking'); }
    function opened(exp) {
      wrap.remove(); document.documentElement.style.overflow = '';
      watchExpiry(exp);
      addLockButton(o);
    }
    // 1) a key unlocked within the last hour (on any of the three pages)?
    (async function () {
      var s = null; try { s = await sGet(); } catch (e) {}
      var now = Date.now();
      if (s && s.key && s.exp > now && s.exp - now <= WINDOW_MS + 6e4) {
        try { await o.onKey(s.key, s.kid); return opened(s.exp); }
        catch (e) {
          if (e && (e.code === 'KID' || e.name === 'OperationError')) await sDel().catch(noop);
          else { reveal(); return say('Couldn’t open it. Check your internet and try again.', true); }
        }
      } else if (s) await sDel().catch(noop);
      reveal();
    })();
    document.addEventListener('keydown', function onKey(e) {
      if (!wrap.isConnected) return document.removeEventListener('keydown', onKey);
      if (/^\d$/.test(e.key)) { press(e.key); flash(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('del'); flash('del'); e.preventDefault(); }
    });
    function flash(k) { var b = btn[k]; if (!b) return; b.classList.add('hit'); setTimeout(function () { b.classList.remove('hit'); }, 120); }
  }
  // lock again: forget the stored key everywhere, then reload (clears everything in memory, shows the PIN pad)
  var locking = false;
  function lockNow() {
    if (locking) return; locking = true;
    sDel().catch(noop).then(function () { try { bc && bc.postMessage('lock'); } catch (e) {} location.reload(); });
  }
  function watchExpiry(exp) {
    function check() { if (Date.now() >= exp) lockNow(); }
    setTimeout(check, Math.min(Math.max(0, exp - Date.now()) + 250, 2147483000));
    setInterval(check, 15e3);                                 // timers can be paused in the background
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    addEventListener('pageshow', check);
    if (bc) bc.onmessage = function (m) { if (m && m.data === 'lock' && !locking) { locking = true; location.reload(); } };
  }
  function addLockButton(o) {
    if (document.querySelector('.pg-lock')) return;
    var host = o.lockMount ? document.querySelector(o.lockMount) : null;
    var b = el('button', 'pg-lock' + (host ? '' : o.lockCorner ? ' corner' : ' float'));
    b.type = 'button'; b.title = 'Lock now'; b.setAttribute('aria-label', 'Lock now');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    b.addEventListener('click', lockNow);
    (host || document.body).appendChild(b);
  }
  root.PinGate = { start: start, lock: lockNow, isOpen: function () { return !!document.querySelector('.pg'); } };
})(window);
