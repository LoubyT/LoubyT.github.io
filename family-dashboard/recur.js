/* Recurrence rules for bills (shared by the app and node tests).
 *  - due_day only            → every month on that day (clamped to month end), from today on. (unchanged)
 *  - due_date + "monthly"    → due_date is the START: first occurrence = due_date, then the same day-of-month
 *                              every month after (clamped, e.g. Jan 31 → Feb 28 → Mar 31). Nothing before the start.
 *  - due_date + "yearly"     → due_date is the start; same month/day each year after.
 *  - due_date + "once"       → just that date.
 */
(function (root) {
  'use strict';
  const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dim = (y, m) => new Date(y, m + 1, 0).getDate();
  const onDay = (y, m, day) => { const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return new Date(yy, mm, Math.min(day, dim(yy, mm))); };
  function nextOccurrence(b, from) {
    if (b.due_day && !b.due_date) {
      let d = onDay(from.getFullYear(), from.getMonth(), b.due_day);
      if (d < from) d = onDay(from.getFullYear(), from.getMonth() + 1, b.due_day);
      return d;
    }
    if (!b.due_date) return null;
    const start = parseD(b.due_date);
    if (start >= from) return start;                      // never anything before the start date
    const repeat = b.repeat || 'once';
    if (repeat === 'once') return start;                  // past one-off (caller filters it out)
    const day = b.due_day || start.getDate();
    if (repeat === 'monthly') {
      let k = (from.getFullYear() - start.getFullYear()) * 12 + (from.getMonth() - start.getMonth());
      let d = onDay(start.getFullYear(), start.getMonth() + k, day);
      if (d < from) d = onDay(start.getFullYear(), start.getMonth() + k + 1, day);
      return d;
    }
    if (repeat === 'yearly') {
      let d = onDay(from.getFullYear(), start.getMonth(), day);
      if (d < from) d = onDay(from.getFullYear() + 1, start.getMonth(), day);
      return d;
    }
    return start;
  }
  /** All occurrences in [from, to] (inclusive). */
  function occurrences(b, from, to) {
    const out = []; let cur = from;
    for (let i = 0; i < 400; i++) {
      const d = nextOccurrence(b, cur); if (!d || d > to || d < from) break;
      if (out.length && +out[out.length - 1] === +d) break;
      out.push(d); cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      if ((b.repeat || (b.due_day ? 'monthly' : 'once')) === 'once') break;
    }
    return out;
  }
  const api = { nextOccurrence, occurrences, parseD };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FDRecur = api;
})(typeof self !== 'undefined' ? self : this);
