/* Shared money math (app + node tests).
 *  - tlBucket/tlTotals: totals rules. "event" rows (and their breakdown items, which live INSIDE the event)
 *    and "transfer" rows are never counted.
 *  - exactMoney: shows a number exactly as stored — never rounds (adds a trailing 0 only for one-decimal cents).
 *  - breakdownCheck: compares the breakdown sum with the event amount in whole cents; never changes either.
 */
(function (root) {
  'use strict';
  function tlBucket(e) {
    if (!e || e.type === 'event' || e.type === 'transfer' || e.amount == null) return null;
    if (e.direction === 'in') return 'in';
    return e.type === 'savings' ? 'saved' : 'out';
  }
  function tlTotals(list) {
    const c = { in: 0, out: 0, saved: 0 }; // integer cents to avoid float drift
    for (const e of list) { const b = tlBucket(e); if (b) c[b] += Math.round(e.amount * 100); }
    return { in: c.in / 100, out: c.out / 100, saved: c.saved / 100 };
  }
  function exactMoney(n) {
    if (typeof n !== 'number' || !isFinite(n)) return String(n);
    let s = String(Math.abs(n));
    if (/e/i.test(s)) s = Math.abs(n).toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
    let [i, f] = s.split('.');
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (f !== undefined && f.length === 1) f += '0';
    return (n < 0 ? '−' : '') + '$' + i + (f !== undefined ? '.' + f : '');
  }
  function breakdownCheck(ev) {
    if (!ev || !Array.isArray(ev.breakdown) || !ev.breakdown.length) return null;
    const sumCents = ev.breakdown.reduce((a, x) => a + Math.round((Number(x.amount) || 0) * 100), 0);
    const totalCents = ev.amount == null ? null : Math.round(ev.amount * 100);
    return { sumCents, totalCents, matches: totalCents !== null && sumCents === totalCents, diffCents: totalCents === null ? null : sumCents - totalCents };
  }
  const api = { tlBucket, tlTotals, exactMoney, breakdownCheck };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FDCalc = api;
})(typeof self !== 'undefined' ? self : this);
