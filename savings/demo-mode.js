/* demo-mode.js — shared by /family-dashboard, /stonks and /savings (copied in by each app's build).
 * Anonymous demo mode: triple-tap (or triple-click) the app's header wordmark to switch between the real data and
 * built-in, clearly fake sample data. The choice is remembered per device and per app (localStorage "demo:<app>")
 * until it's toggled off. Switching reloads the page, so nothing from one mode stays in memory or the DOM.
 * In demo mode the apps never decrypt the real data, never call the refresh/quote relay and never save anything.
 * The PIN is still required either way (pin-gate.js is unchanged).
 *   DemoMode.isOn(app)                     → boolean
 *   DemoMode.set(app, on) / toggle(app)    → stores the flag and reloads
 *   DemoMode.bindTripleTap(els, onTriple)  → 3 taps/clicks within ~600 ms
 *   DemoMode.pill(mount, {where})          → small discreet "Demo" pill (only when on) */
(function (root) {
  'use strict';
  var WINDOW_MS = 600;
  var k = function (app) { return 'demo:' + String(app || 'app'); };
  function isOn(app) { try { return root.localStorage.getItem(k(app)) === '1'; } catch (e) { return false; } }
  function set(app, on, opts) {
    try { if (on) root.localStorage.setItem(k(app), '1'); else root.localStorage.removeItem(k(app)); } catch (e) {}
    if (!opts || opts.reload !== false) root.location.reload();
  }
  function toggle(app, opts) { set(app, !isOn(app), opts); }
  function bindTripleTap(els, onTriple) {
    var list = (els && els.length !== undefined && typeof els !== 'string') ? els : [els];
    var taps = [];
    var hit = function (e) {
      var now = Date.now();
      taps = taps.filter(function (t) { return now - t <= WINDOW_MS; }); taps.push(now);
      if (taps.length >= 3) { taps = []; if (e && e.preventDefault) e.preventDefault(); onTriple(); }
    };
    list.forEach(function (el) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) return;
      el.style.touchAction = 'manipulation';           // no double-tap zoom eating the taps on iPhone
      el.style.webkitUserSelect = el.style.userSelect = 'none'; // a triple-click doesn't select the text
      el.style.webkitTouchCallout = 'none';
      el.addEventListener('click', hit);
    });
  }
  function pill(mount, opts) {
    opts = opts || {};
    var m = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!m || m.querySelector('.demo-pill')) return null;
    var p = document.createElement('span');
    p.className = 'demo-pill'; p.textContent = 'Demo'; p.title = 'Demo mode: sample data';
    p.setAttribute('aria-label', 'Demo mode, sample data');
    var s = p.style;
    s.display = 'inline-flex'; s.alignItems = 'center'; s.font = '600 9.5px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    s.letterSpacing = '.12em'; s.textTransform = 'uppercase'; s.padding = '3px 7px'; s.borderRadius = '999px';
    s.border = '1px solid currentColor'; s.opacity = opts.opacity || '.55'; s.whiteSpace = 'nowrap'; s.verticalAlign = 'middle';
    s.pointerEvents = 'none'; s.flexShrink = '0'; s.alignSelf = 'center';
    if (opts.margin) s.margin = opts.margin;
    if (opts.where === 'start') m.insertBefore(p, m.firstChild); else m.appendChild(p);
    return p;
  }
  root.DemoMode = { isOn: isOn, set: set, toggle: toggle, bindTripleTap: bindTripleTap, pill: pill, WINDOW_MS: WINDOW_MS };
})(typeof window !== 'undefined' ? window : this);
