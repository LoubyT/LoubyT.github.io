/* Bill logos (shared by the app and node tests). Map a bill name to a small mark for the round dark tile.
 * This public file only knows generic categories. Brand marks for the family's own payees are private: they arrive
 * inside the encrypted data (DATA.logo_rules, added by tools/publish.js) and are applied with setRules() after the PIN.
 *  - "svg":   brand mark as an inline data: URI from the encrypted data — never loaded from a third party
 *  - "text":  brand-coloured lettering tile
 *  - "emoji": category emoji (rent, utilities, phone, …) or the feed's own emoji
 *  - "initial": coloured first-letter tile as the last resort
 */
(function (root) {
  'use strict';
  const CATEGORIES = [
    [/\brent\b|\blandlord\b|\bmortgage\b|\bhoa\b/i, { kind: 'emoji', emoji: '🏠' }],
    [/\belectric\w*|\bpower\b|\benergy\b/i, { kind: 'emoji', emoji: '⚡' }],
    [/\bgas\b|\bpropane\b/i, { kind: 'emoji', emoji: '🔥' }],
    [/\bwater\b|\bsewer\b|\butilit(y|ies)\b/i, { kind: 'emoji', emoji: '💧' }],
    [/\btrash\b|\bwaste\b|\bgarbage\b/i, { kind: 'emoji', emoji: '🗑️' }],
    [/\bstudent\b|\bschool\b|\btuition\b/i, { kind: 'emoji', emoji: '🎓' }],
    [/\bcar\b|\bauto\b|\bvehicle\b/i, { kind: 'emoji', emoji: '🚗' }],
    [/\binsurance\b/i, { kind: 'emoji', emoji: '🛡️' }],
    [/\bwireless\b|\bphone\b|\bmobile\b|\bcell\b/i, { kind: 'emoji', emoji: '📱' }],
    [/\binternet\b|\bwi-?fi\b|\bbroadband\b/i, { kind: 'emoji', emoji: '🌐' }],
    [/\bgym\b|\bfitness\b/i, { kind: 'emoji', emoji: '🏋️' }],
    [/\bvets?\b|\bpets?\b/i, { kind: 'emoji', emoji: '🐾' }],
    [/\bstream\w*|\btv\b|\bmusic\b/i, { kind: 'emoji', emoji: '📺' }],
  ];
  let PRIVATE = [];
  const SAFE_SRC = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/;
  /** Private brand rules from the decrypted data: [{ re, flags, logo }]. Anything malformed is skipped. */
  function setRules(rules) {
    PRIVATE = [];
    for (const r of Array.isArray(rules) ? rules : []) {
      try {
        const l = r && r.logo; if (!l || !['svg', 'text', 'emoji'].includes(l.kind)) continue;
        if (l.kind === 'svg' && !SAFE_SRC.test(String(l.src || ''))) continue;
        PRIVATE.push([new RegExp(String(r.re), String(r.flags || '').replace(/[^imsu]/g, '')), l]);
      } catch (e) { /* bad pattern: skip */ }
    }
  }
  const PAL = ['#4da3ff', '#8b7bff', '#ff6fb5', '#2ee6c5', '#ffb84d', '#3ddc84', '#ff8a5d'];
  function logoFor(name, icon) {
    const n = String(name || '');
    for (const [re, v] of PRIVATE.concat(CATEGORIES)) if (re.test(n)) {
      if (v.kind === 'emoji' && icon) return { kind: 'emoji', emoji: icon }; // the feed's own emoji wins over a generic category
      return v;
    }
    if (icon) return { kind: 'emoji', emoji: icon };
    const ch = (n.match(/[A-Za-z0-9]/) || ['•'])[0].toUpperCase();
    let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return { kind: 'initial', text: ch, bg: PAL[h % PAL.length], fg: '#0b0d12' };
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** HTML for the inside of the round dark tile (.emoji). */
  function logoHtml(name, icon) {
    const l = logoFor(name, icon);
    if (l.kind === 'svg') return `<img class="logo" src="${esc(l.src)}" alt="" width="26" height="26" decoding="async">`;
    if (l.kind === 'text' || l.kind === 'initial') return `<span class="logo-txt${String(l.text).length > 2 ? ' long' : ''}" style="background:${esc(l.bg)};color:${esc(l.fg)}">${esc(l.text)}</span>`;
    return esc(l.emoji);
  }
  const api = { logoFor, logoHtml, setRules };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FDLogos = api;
})(typeof self !== 'undefined' ? self : this);
