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
  // Paychecks: non-transfer items vs total_out (whole cents). Transfers are internal moves → excluded.
  function paycheckCheck(pc) {
    if (!pc || !Array.isArray(pc.items)) return null;
    const sumCents = pc.items.filter((i) => i.type !== 'transfer').reduce((a, i) => a + Math.round((Number(i.amount) || 0) * 100), 0);
    const totalCents = typeof pc.total_out === 'number' ? Math.round(pc.total_out * 100) : null;
    return { sumCents, totalCents, matches: totalCents !== null && sumCents === totalCents, diffCents: totalCents === null ? null : sumCents - totalCents };
  }
  // Index of the check to feature: the current one (payday <= today <= period_end, or before the next payday
  // when period_end is missing); else the next upcoming; else the last one. `list` must be sorted by date.
  function pickCurrentPaycheck(list, todayIso) {
    if (!Array.isArray(list) || !list.length) return -1;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.date > todayIso) continue;
      const end = p.period_end || (list[i + 1] ? null : p.date);
      if (end ? todayIso <= end : todayIso < list[i + 1].date) return i;
      break;
    }
    const next = list.findIndex((p) => p.date >= todayIso);
    return next >= 0 ? next : list.length - 1;
  }
  // Category actuals (tracked spending from the budget file). Values are used exactly as given here (publish.js may set
  // actual.budget/left per period first — see periodBudget).
  // stale: 'ended' when today is after period_end; 'old' when as_of is before period_start of a period that has begun.
  // upcoming: the period hasn't started yet (e.g. plan starts at the next payday) — not stale.
  // left may be null (e.g. a line that hasn't started); it is never computed.
  function actualStatus(c, todayIso) {
    const a = c && c.actual;
    if (!a || typeof a !== 'object') return null;
    const asOf = typeof a.as_of === 'string' ? a.as_of.slice(0, 10) : '';
    const upcoming = !!(a.period_start && todayIso < a.period_start);
    const stale = a.period_end && todayIso > a.period_end ? 'ended' : !upcoming && asOf && a.period_start && asOf < a.period_start ? 'old' : null;
    // plan = this period's budget when the data carries one (actual.budget: from the budget source, or derived at publish time
    // by periodBudget below); otherwise the line's flat amount.
    const plan = typeof a.budget === 'number' ? a.budget : typeof c.amount === 'number' ? c.amount : null;
    const frac = plan ? a.spent / plan : 0;
    return { spent: a.spent, left: typeof a.left === 'number' ? a.left : null, plan, frac, stale, upcoming, note: typeof a.note === 'string' && a.note ? a.note : null, transactions: Array.isArray(a.transactions) ? a.transactions : [] };
  }
  // Per-period budget for a tracked line (used by publish.js; pure, no rounding beyond whole cents).
  // Order: 1) actual.budget from the source (explicit — left as given, or budget − spent if left is missing);
  //        2) a source left that is NOT simply "flat amount − spent" (the source already used its own period amount,
  //           e.g. two units bought in one order) → kept, budget = spent + left;
  //        3) the planned timeline "spending" rows for this line dated period_start..period_end (matched by name,
  //           e.g. "Groceries", "Bob's snacks" = "Bob snacks", "Pets (food + litter)" = "Pets") → budget = their sum, left = budget − spent;
  //        4) otherwise the flat amount (left exactly as given).
  // left = null (line not started) always stays null.
  const nameKey = (v) => String(v || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/['\u2019]s\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const c2 = (x) => Math.round(x * 100);
  function periodBudget(c, timeline) {
    const a = c && c.actual;
    if (!a || typeof a !== 'object' || typeof a.spent !== 'number') return null;
    const flat = typeof c.amount === 'number' ? c.amount : null;
    if (typeof a.budget === 'number') return { budget: a.budget, source: 'source', left: a.left === null ? null : typeof a.left === 'number' ? a.left : (c2(a.budget) - c2(a.spent)) / 100 };
    if (a.left === null) return { budget: flat, source: 'flat', left: null };
    const flatLeft = flat != null ? (c2(flat) - c2(a.spent)) / 100 : null;
    if (typeof a.left === 'number' && flatLeft != null && c2(a.left) !== c2(flatLeft)) return { budget: (c2(a.spent) + c2(a.left)) / 100, source: 'source-left', left: a.left };
    const keys = new Set([nameKey(c.name), nameKey(String(c.id || '').replace(/-/g, ' '))].filter(Boolean));
    const rows = (timeline || []).filter((e) => e && e.type === 'spending' && typeof e.amount === 'number' && e.date >= a.period_start && e.date <= a.period_end && keys.has(nameKey(e.name)));
    if (rows.length) { const b = rows.reduce((t, e) => t + c2(e.amount), 0); return { budget: b / 100, source: 'timeline', left: (b - c2(a.spent)) / 100, rows: rows.length }; }
    return { budget: flat, source: 'flat', left: typeof a.left === 'number' ? a.left : flatLeft };
  }
  // Summary of tracked lines only (current: not stale, not upcoming). Uses only the data file — never on-device entries.
  function trackedTotals(cats, todayIso) {
    let lines = 0, spentCents = 0, planCents = 0, upcoming = 0, nextStart = null;
    for (const c of cats || []) {
      const s = actualStatus(c, todayIso); if (!s) continue;
      if (s.upcoming) { upcoming++; if (!nextStart || c.actual.period_start < nextStart) nextStart = c.actual.period_start; continue; }
      if (s.stale || typeof s.spent !== 'number') continue;
      lines++; spentCents += Math.round(s.spent * 100); if (s.plan != null) planCents += Math.round(s.plan * 100);
    }
    return { lines, spent: spentCents / 100, plan: planCents / 100, upcoming, nextStart };
  }
  // Live-refresh button state. tap = this phone's last SUCCESSFUL request, shared = last_refresh_request published by
  // the updater (any phone), published = data.enc's published_at. All ISO strings (or empty); now in ms.
  //  updating: our request is < timeout old and newer than the data → spinner, poll
  //  late:     timed out waiting but still inside the cooldown → "Still waiting — try again later"
  //  cooldown: a request (ours or the other phone's) is < cooldown old → disabled, "Next refresh available at h:mm"
  //  idle:     tap allowed;  off: no live refresh configured (plain re-fetch)
  function refreshState({ cfg, tap, shared, published, now }) {
    if (!cfg) return { kind: 'off' };
    const cool = (cfg.cooldown_min || 30) * 60e3, tmo = (cfg.timeout_min || 15) * 60e3;
    const t = Date.parse(tap) || 0, sh = Date.parse(shared) || 0, pub = Date.parse(published) || 0;
    const next = Math.max(t, sh) + cool;
    if (t && pub <= t && now - t < tmo) return { kind: 'updating', next };
    if (now < next) return { kind: t && pub <= t ? 'late' : 'cooldown', next };
    return { kind: 'idle' };
  }
  const api = { refreshState, tlBucket, tlTotals, exactMoney, breakdownCheck, paycheckCheck, pickCurrentPaycheck, actualStatus, trackedTotals, periodBudget, nameKey };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FDCalc = api;
})(typeof self !== 'undefined' ? self : this);
