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
  const DAYMS = 864e5;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const okDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  // The occurrence before `d` for a recurring bill (used to tell whether last_paid already covered `d`).
  function prevOccurrence(b, d) {
    const repeat = b.due_day && !b.due_date ? 'monthly' : b.repeat || 'once';
    const day = b.due_day || (b.due_date ? parseD(b.due_date).getDate() : d.getDate());
    if (repeat === 'monthly') return onDay(d.getFullYear(), d.getMonth() - 1, day);
    if (repeat === 'yearly') return onDay(d.getFullYear() - 1, d.getMonth(), day);
    return new Date(d.getTime() - 60 * DAYMS);
  }
  /** The ONE occurrence of a bill to show on/after `today` (never a duplicate, never an already-paid earlier one).
   *  1. next_payment {date, amount, due_date} from the feed wins until its planned date (date) has passed — the bill
   *     stays listed after its due date until the planned payment date, then that occurrence drops off.
   *  2. Otherwise the recurrence (due_date = start for monthly/yearly), starting after any passed next_payment, and
   *     skipping an occurrence that last_paid already covered (paid after the previous occurrence).
   *  Returns { due, planned|null, key (date to sort/count by: the planned date while it's ahead, else the due date),
   *            afterDue (planned later than due), amount (exact; next_payment.amount when it applies), fromFeed } or null. */
  function billNext(b, today) {
    const np = b.next_payment;
    let from = today;
    if (np && okDate(np.due_date)) {
      const due = parseD(np.due_date), planned = okDate(np.date) ? parseD(np.date) : null;
      if (planned ? planned >= today : due >= today) {   // active until its planned payment date (then it drops off)
        const key = planned && planned >= today ? planned : due; // the planned payment date when one is ahead
        const near = [due, planned].filter((x) => x && x >= today).sort((x, y) => x - y)[0]; // for the "next 45 days" window
        return { due, planned, key, near, afterDue: !!(planned && planned > due), amount: typeof np.amount === 'number' ? np.amount : b.amount, fromFeed: true };
      }
      const last = planned && planned > due ? planned : due;   // this payment is behind us → it drops off
      from = new Date(Math.max(+today, +last + DAYMS));
      from = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    }
    let d = nextOccurrence(b, from);
    if (!d || d < from) return null;
    const lp = b.last_paid && okDate(b.last_paid.date) ? b.last_paid.date : null;
    if (lp && lp <= iso(today)) {
      const repeat = b.due_day && !b.due_date ? 'monthly' : b.repeat || 'once';
      if (lp > iso(prevOccurrence(b, d))) {                    // already paid this cycle
        if (repeat === 'once') return null;
        d = nextOccurrence(b, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
        if (!d) return null;
      }
    }
    return { due: d, planned: null, key: d, near: d, afterDue: false, amount: b.amount, fromFeed: false };
  }
  const api = { nextOccurrence, occurrences, parseD, billNext };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FDRecur = api;
})(typeof self !== 'undefined' ? self : this);
