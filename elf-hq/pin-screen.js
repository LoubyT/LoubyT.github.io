/* Full-screen PIN. The book stays hidden until this succeeds.
 * Posts to the Elf session route only. A budget data key is refused and not stored.
 * A good session is remembered on this device for one hour, same idea as the other louby.net locks.
 */
(function (root) {
  'use strict';
  var DEV_KEY = 'pin.device';
  var LOCK_KEY = 'elf-hq.pin.lock';
  var DB = 'elf-hq-open';
  var SKEY = 'current';
  var waiters = [];
  var opened = false;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function deviceId() {
    var id = '';
    try { id = localStorage.getItem(DEV_KEY) || ''; } catch (e) {}
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { localStorage.setItem(DEV_KEY, id); } catch (e) {}
    }
    return id;
  }
  function idb(mode, fn) {
    return new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB, 1); } catch (err) { reject(err); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore('s'); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var db = req.result;
        try {
          var tx = db.transaction('s', mode);
          var out = fn(tx.objectStore('s'));
          tx.oncomplete = function () { db.close(); resolve(out && out.result); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        } catch (err) { db.close(); reject(err); }
      };
    });
  }
  function readSession() { return idb('readonly', function (store) { return store.get(SKEY); }); }
  function writeSession(value) { return idb('readwrite', function (store) { return store.put(value, SKEY); }); }
  function clearSession() { return idb('readwrite', function (store) { return store.delete(SKEY); }); }
  function remember(session, exp) {
    try {
      sessionStorage.setItem('elf-hq-session', session);
      sessionStorage.setItem('elf-hq-session-exp', String(exp));
    } catch (e) {}
    return writeSession({ session: session, exp: exp });
  }
  function forget() {
    try {
      sessionStorage.removeItem('elf-hq-session');
      sessionStorage.removeItem('elf-hq-session-exp');
    } catch (e) {}
    return clearSession();
  }
  function sessionUrl() {
    var cfg = root.ElfLiveConfig || {};
    return cfg.session || 'https://fd-refresh-relay.vercel.app/api/elf-session';
  }
  function markOpen() {
    opened = true;
    document.documentElement.classList.remove('needs-pin');
    var book = document.getElementById('book');
    if (book) book.hidden = false;
    waiters.splice(0).forEach(function (fn) { fn(); });
  }
  function whenOpen(fn) {
    if (opened) fn();
    else waiters.push(fn);
  }

  function showPad() {
    var wrap = el('div', 'elf-lock');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'elfLockTitle');
    var box = el('div');
    var title = el('h1', null, 'Elf HQ');
    title.id = 'elfLockTitle';
    var sub = el('p', null, 'Enter the household PIN');
    var dots = el('div', 'elf-dots');
    for (var i = 0; i < 4; i++) dots.appendChild(el('i'));
    var msg = el('p', 'elf-msg');
    msg.setAttribute('role', 'status');
    var pad = el('div', 'elf-pad');
    var pin = '';
    var busy = false;
    var lockUntil = 0;
    function draw() {
      var marks = dots.children;
      for (var n = 0; n < 4; n++) marks[n].className = n < pin.length ? 'on' : '';
    }
    function say(text, warn) {
      msg.textContent = text || '';
      msg.className = warn ? 'elf-msg warn' : 'elf-msg';
    }
    function locked() { return lockUntil && lockUntil > Date.now(); }
    function press(key) {
      if (busy || locked()) return;
      if (key === 'del') { pin = pin.slice(0, -1); draw(); return; }
      if (!/^\d$/.test(key) || pin.length >= 4) return;
      pin += key;
      draw();
      if (pin.length === 4) send();
    }
    function send() {
      busy = true;
      var attempt = pin;
      pin = '';
      fetch(sessionUrl(), {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: attempt, deviceId: deviceId(), app: 'elf-hq' })
      }).then(function (res) {
        return res.json().then(function (body) { return { status: res.status, body: body || {} }; }, function () { return { status: res.status, body: {} }; });
      }).then(function (res) {
        busy = false;
        attempt = '';
        var body = res.body;
        if (body.key || body.kid) {
          draw();
          say('That answer was refused. Nothing from the budget apps was kept.', true);
          return;
        }
        if (res.status === 200 && body.session) {
          var exp = Date.parse(body.exp) || (Date.now() + 3600e3);
          remember(body.session, exp).catch(function () {}).then(function () {
            wrap.remove();
            markOpen();
          });
          return;
        }
        draw();
        if (res.status === 401 || res.status === 400) say('Wrong PIN.', true);
        else if (res.status === 423 || res.status === 429) {
          lockUntil = Date.parse(body.until) || (Date.now() + 3600e3);
          say('Too many tries. This phone has to wait.', true);
        } else say('The lock did not answer. Try again in a minute.', true);
      }, function () {
        busy = false;
        pin = '';
        draw();
        say('The lock did not answer. Check the connection and try again.', true);
      });
    }
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].forEach(function (key) {
      var button = el('button', key === 'del' ? 'ghost' : null, key === 'del' ? 'Delete' : key);
      button.type = 'button';
      if (!key) { button.className = 'sp'; button.tabIndex = -1; button.setAttribute('aria-hidden', 'true'); }
      if (key === 'del') button.setAttribute('aria-label', 'Delete');
      button.addEventListener('click', function () { press(key); });
      pad.appendChild(button);
    });
    box.appendChild(title);
    box.appendChild(sub);
    box.appendChild(dots);
    box.appendChild(msg);
    box.appendChild(pad);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    document.addEventListener('keydown', function (event) {
      if (!wrap.isConnected) return;
      if (/^\d$/.test(event.key)) { press(event.key); event.preventDefault(); }
      else if (event.key === 'Backspace') { press('del'); event.preventDefault(); }
    });
  }

  function start() {
    readSession().then(function (saved) {
      if (saved && saved.session && saved.exp > Date.now()) {
        try {
          sessionStorage.setItem('elf-hq-session', saved.session);
          sessionStorage.setItem('elf-hq-session-exp', String(saved.exp));
        } catch (e) {}
        markOpen();
        return;
      }
      return forget().catch(function () {}).then(showPad);
    }, showPad);
  }

  root.ElfPin = { whenOpen: whenOpen, start: start, forget: forget };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})(window);
