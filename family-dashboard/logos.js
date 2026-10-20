/* Bill logos (shared by the app and node tests). Map a bill name to a small mark for the round dark tile:
 *  - "svg":   self-hosted brand mark in logos/ (Simple Icons, CC0) — never loaded from a third party
 *  - "text":  brand-coloured lettering tile for brands with no free mark (no copied logo artwork)
 *  - "emoji": category emoji for local utilities, rent, loans, and anything we don't recognise by brand
 *  - "initial": coloured first-letter tile as the last resort
 */
(function (root) {
  'use strict';
  const RULES = [
    // brand marks (files)
    [/\byou ?tube\b/i, { kind: 'svg', file: 'logos/youtube.svg', label: 'YouTube' }],
    [/\bnetflix\b/i, { kind: 'svg', file: 'logos/netflix.svg', label: 'Netflix' }],
    [/\bat ?& ?t\b|\bat ?and ?t\b/i, { kind: 'svg', file: 'logos/att.svg', label: 'AT&T' }],
    [/\bgoogle\b/i, { kind: 'svg', file: 'logos/google.svg', label: 'Google' }],
    // brand-coloured lettering (no free logo available)
    [/\bdisney\b|\bhulu\b/i, { kind: 'text', text: 'D+', bg: '#0b1f6b', fg: '#ffffff', label: 'Disney+' }],
    [/\bamazon\b|\bprime\b/i, { kind: 'text', text: 'prime', bg: '#00a8e1', fg: '#ffffff', label: 'Amazon Prime' }],
    [/\bstate ?farm\b/i, { kind: 'text', text: 'SF', bg: '#d62311', fg: '#ffffff', label: 'State Farm' }],
    [/\bally\b/i, { kind: 'text', text: 'ally', bg: '#650360', fg: '#ffffff', label: 'Ally' }],
    [/\bspotify\b/i, { kind: 'text', text: 'S', bg: '#1db954', fg: '#000000', label: 'Spotify' }],
    // categories
    [/\brent\b|\blandlord\b|\bmortgage\b|\bhoa\b/i, { kind: 'emoji', emoji: '🏠' }],
    [/\belectric\w*|\bbluebonnet\b|\bpower\b|\benergy\b/i, { kind: 'emoji', emoji: '⚡' }],
    [/\bcenterpoint\b|\batmos\b|\bgas\b|\bpropane\b/i, { kind: 'emoji', emoji: '🔥' }],
    [/\bwater\b|\bsewer\b|\butilit(y|ies)\b/i, { kind: 'emoji', emoji: '💧' }],
    [/\btrash\b|\bwaste\b|\bgarbage\b/i, { kind: 'emoji', emoji: '🗑️' }],
    [/\baidvantage\b|\bstudent\b|\bschool\b|\btuition\b/i, { kind: 'emoji', emoji: '🎓' }],
    [/\bcar\b|\bauto\b|\bvehicle\b/i, { kind: 'emoji', emoji: '🚗' }],
    [/\binsurance\b/i, { kind: 'emoji', emoji: '🛡️' }],
    [/\bwireless\b|\bphone\b|\bmobile\b|\bcell\b/i, { kind: 'emoji', emoji: '📱' }],
    [/\binternet\b|\bwi-?fi\b|\bbroadband\b/i, { kind: 'emoji', emoji: '🌐' }],
    [/\bgym\b|\bfitness\b/i, { kind: 'emoji', emoji: '🏋️' }],
    [/\bvets?\b|\bpets?\b/i, { kind: 'emoji', emoji: '🐾' }],
    [/\bstream\w*|\btv\b|\bmusic\b/i, { kind: 'emoji', emoji: '📺' }],
  ];
  const PAL = ['#4da3ff', '#8b7bff', '#ff6fb5', '#2ee6c5', '#ffb84d', '#3ddc84', '#ff8a5d'];
  function logoFor(name, icon) {
    const n = String(name || '');
    for (const [re, v] of RULES) if (re.test(n)) {
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
    if (l.kind === 'svg') return `<img class="logo" src="${esc(l.file)}" alt="" width="26" height="26" decoding="async">`;
    if (l.kind === 'text' || l.kind === 'initial') return `<span class="logo-txt${l.text.length > 2 ? ' long' : ''}" style="background:${esc(l.bg)};color:${esc(l.fg)}">${esc(l.text)}</span>`;
    return esc(l.emoji);
  }
  const FILES = [...new Set(RULES.map(([, v]) => v.file).filter(Boolean))];
  const api = { logoFor, logoHtml, FILES };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FDLogos = api;
})(typeof self !== 'undefined' ? self : this);
