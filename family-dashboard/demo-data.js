/* demo-data.js — clearly FAKE sample data for demo mode (triple-tap the greeting; see demo-mode.js).
 * Built on the phone for "today", in the same shape publish.js produces, so every feature works on it.
 * A made-up family (Sam, Jordan, Maya, Theo and Biscuit the dog); every name and amount here is invented and none
 * is taken from, or derived from, the real budget. No debts or collections. Nothing here is fetched or saved.
 *   FDDemo.build('YYYY-MM-DD') → data object (browser: window.FDDemo, Node: module.exports) */
(function (root) {
  'use strict';
  const Calc = typeof module === 'object' && module.exports ? require('./calc.js') : root.FDCalc;
  const pd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const days = (a, b) => Math.round((b - a) / 864e5);
  const cents = (x) => Math.round(x * 100);
  const sum = (a) => a.reduce((t, x) => t + cents(x), 0) / 100;
  const onDay = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));

  const PAY = 4215.6, START_BAL = 1674.2, ACCT = 'Checking';
  const BILLS = [
    { id: 'rent', name: 'Rent', amount: 1645, due_day: 1, protected: true, icon: '🏠' },
    { id: 'health', name: 'Health insurance', amount: 568.4, due_day: 16, protected: true, autopay: true, icon: '🩺' },
    { id: 'daycare', name: 'Daycare', amount: 884, due_day: 19, protected: true, icon: '🧸' },
    { id: 'music', name: 'Music streaming', amount: 16.49, due_day: 6, autopay: true, icon: '🎵' },
    { id: 'internet', name: 'Internet', amount: 89.95, due_day: 9, autopay: true, icon: '📶' },
    { id: 'car-insurance', name: 'Car insurance', amount: 188.7, due_day: 13, autopay: true, icon: '🚗' },
    { id: 'gym', name: 'Gym', amount: 39.5, due_day: 15, autopay: true, icon: '🏋️' },
    { id: 'electric', name: 'Electric', amount: 121.3, due_day: 18, icon: '💡' },
    { id: 'phone', name: 'Phone plan', amount: 127.6, due_day: 21, autopay: true, icon: '📱' },
    { id: 'water', name: 'Water & trash', amount: 65.15, due_day: 24, icon: '🚰' },
  ];
  const GROC = [53.52, 19.49, 34.14, 10.68, 31.12], GROC_AT = ['Fresh Fields Market', 'Corner Grocer', 'Fresh Fields Market', 'Bakery on Fifth', 'Corner Grocer'];

  function build(todayIso) {
    const T = pd(todayIso);
    // paydays: every other Friday (made-up schedule), 4 past checks + this one + 6 ahead
    const epoch = new Date(2024, 0, 5);
    const p0 = add(epoch, Math.floor(days(epoch, T) / 14) * 14);
    const paydays = []; for (let i = -4; i <= 6; i++) paydays.push(add(p0, i * 14));
    const first = paydays[0], last = add(paydays[paydays.length - 1], 13);

    // ledger of every planned money movement (one account), first payday → end of the last check
    const L = [];
    for (let d = first; d <= last; d = add(d, 1)) {
      const s = iso(d), dow = d.getDay(), dom = d.getDate();
      if (paydays.some((p) => +p === +d)) {
        L.push({ date: s, type: 'income', name: 'Paycheck · Northwind Co.', amount: PAY, direction: 'in', account: ACCT });
        L.push({ date: s, type: 'savings', name: 'Braces fund', amount: 104, direction: 'out', account: ACCT, note: 'Every payday' });
        L.push({ date: s, type: 'transfer', name: 'Move to joint savings', amount: 1365, account: 'Checking → Joint savings' });
      }
      if (dom === 20) L.push({ date: s, type: 'income', name: 'Tutoring', amount: 238, direction: 'in', account: ACCT, estimated: true });
      for (const b of BILLS) { // the electric bill is always paid two days before it's due
        const early = b.id === 'electric' ? 2 : 0, due = add(d, early);
        if (+onDay(due.getFullYear(), due.getMonth(), b.due_day) === +due)
          L.push({ date: s, type: 'bill', name: b.name, amount: b.amount, direction: 'out', account: ACCT, due_date: iso(due), ...(b.protected ? { protected: true } : {}) });
      }
      if (dow === 6) { // Saturday shop; one bigger stock-up week three weeks out
        const big = days(T, d) >= 15 && days(T, d) <= 21;
        L.push({ date: s, type: 'spending', name: 'Groceries', amount: big ? 206.5 : 152.5, direction: 'out', account: ACCT, ...(big ? { note: 'Stock-up week' } : {}) });
      }
      if (dow === 1) L.push({ date: s, type: 'spending', name: 'Gas', amount: 93.6, direction: 'out', account: ACCT });
      if (dow === 5) L.push({ date: s, type: 'spending', name: 'Dining out', amount: 83, direction: 'out', account: ACCT });
      if (dom === 3) L.push({ date: s, type: 'spending', name: 'Kids activities', amount: 124, direction: 'out', account: ACCT });
      if (dom === 7) L.push({ date: s, type: 'spending', name: 'Biscuit (dog)', amount: 76, direction: 'out', account: ACCT });
      if (dom === 11) L.push({ date: s, type: 'spending', name: 'Household', amount: 97, direction: 'out', account: ACCT });
    }
    let bal = START_BAL;
    for (const e of L) {
      if (e.type === 'income') bal += e.amount; else bal -= e.amount; // transfers leave this account too
      e.balance_after = Math.round(bal * 100) / 100;
    }

    // paychecks with their full plan
    const dates = paydays.map((p, i) => {
      const from = iso(p), to = iso(add(p, 13));
      const win = L.filter((e) => e.date >= from && e.date <= to);
      const items = win.filter((e) => e.type !== 'income').map((e) => {
        const it = { date: e.date, name: e.name, amount: e.amount, type: e.type, account: e.account };
        if (e.protected) it.protected = true; if (e.due_date) it.due_date = e.due_date; if (e.note) it.note = e.note;
        return it;
      });
      const other = win.filter((e) => e.type === 'income' && e.name === 'Tutoring').map((e) => ({ date: e.date, name: e.name, amount: e.amount, account: e.account, estimated: true }));
      const totalOut = sum(items.filter((x) => x.type !== 'transfer').map((x) => x.amount));
      const low = win.reduce((m, e) => (!m || e.balance_after < m.balance_after ? e : m), null);
      const pc = { date: from, amount: PAY, label: String(i + 1), period_end: to, total_out: totalOut, left_over: Math.round((PAY - totalOut) * 100) / 100, items };
      if (other.length) pc.other_income = other;
      if (low) pc.low_point = { date: low.date, balance: low.balance_after, account: ACCT };
      return pc;
    });

    // plans + birthdays (made-up people and dates)
    const lake = add(T, 24), fair = add(T, 9), dentist = add(T, 16);
    const events = [
      { id: 'maya-bday', name: 'Maya’s birthday', date: '2017-03-14', kind: 'birthday', repeat: 'yearly', icon: '🎂' },
      { id: 'theo-bday', name: 'Theo’s birthday', date: '2021-12-09', kind: 'birthday', repeat: 'yearly', icon: '🎈' },
      { id: 'sam-bday', name: 'Sam’s birthday', date: '1989-06-30', kind: 'birthday', repeat: 'yearly', icon: '🎁' },
      { id: 'lake', name: 'Lake weekend', date: iso(lake), end_date: iso(add(lake, 2)), kind: 'event', repeat: 'once', icon: '🏕️', budget: 600, estimated: true },
      { id: 'book-fair', name: 'School book fair', date: iso(fair), kind: 'event', repeat: 'once', icon: '📚', budget: 48 },
      { id: 'dentist', name: 'Dentist check-up', date: iso(dentist), kind: 'event', repeat: 'once', icon: '🦷' },
    ];
    const timeline = L.filter((e) => e.date >= todayIso).map((e) => ({ ...e }));
    timeline.push({ date: iso(lake), end_date: iso(add(lake, 2)), type: 'event', name: 'Lake weekend', amount: 600, estimated: true, note: 'Paid from the fun envelope',
      breakdown: [{ item: 'Cabin, 2 nights', amount: 359, when: iso(lake) }, { item: 'Food & snacks', amount: 172 }, { item: 'Gas', amount: 69, note: 'Round trip' }] });
    timeline.sort((a, b) => a.date.localeCompare(b.date));

    // budget lines with tracked spending (this week / this month / this paycheck)
    const wkS = add(T, -T.getDay()), wkE = add(wkS, 6), moS = new Date(T.getFullYear(), T.getMonth(), 1), moE = new Date(T.getFullYear(), T.getMonth() + 1, 0);
    const curPay = paydays.filter((p) => p <= T).pop(), payE = add(curPay, 13);
    const tx = (from, to, every, amounts, merchants) => {
      const out = []; let k = 0;
      for (let d = from; d <= to && d <= T; d = add(d, every)) { out.push({ date: iso(d), merchant: merchants[k % merchants.length], amount: amounts[k % amounts.length], account: 'Debit card' }); k++; }
      return out;
    };
    const line = (c, from, to, list) => {
      const spent = sum(list.map((x) => x.amount));
      const flat = typeof c.amount === 'number' ? c.amount : null;
      c.actual = { period_start: iso(from), period_end: iso(to), spent, as_of: todayIso, left: flat == null ? null : Math.round((flat - spent) * 100) / 100, transactions: list };
      return c;
    };
    const categories = [
      line({ id: 'groceries', name: 'Groceries', amount: 152.5, period: 'week', icon: '🛒' }, wkS, wkE, tx(wkS, wkE, 2, GROC, GROC_AT)),
      line({ id: 'dining', name: 'Dining out', amount: 83, period: 'week', icon: '🌮' }, wkS, wkE, tx(add(wkS, 1), wkE, 3, [25.39, 36.09], ['Taco Truck', 'Pizza Place'])),
      line({ id: 'gas', name: 'Gas', amount: 187.2, period: 'paycheck', icon: '⛽' }, curPay, payE, tx(add(curPay, 1), payE, 5, [56.88, 53.68], ['Gas station'])),
      line({ id: 'kids', name: 'Kids activities', amount: 124, period: 'month', icon: '🎨' }, moS, moE, tx(add(moS, 2), moE, 12, [62.1, 22.74], ['Swim lessons', 'Art supplies'])),
      line({ id: 'pet', name: 'Biscuit (dog)', amount: 76, period: 'month', icon: '🐶' }, moS, moE, tx(add(moS, 6), moE, 14, [45.53, 20.01], ['Pet supply store', 'Dog park pass'])),
      { id: 'household', name: 'Household', amount: 97, period: 'month', icon: '🧺', note: 'Cleaning stuff, paper goods' },
      { id: 'fun', name: 'Fun money', amount: null, period: 'paycheck', icon: '🎉', placeholder: true },
    ];
    for (const c of categories) {
      if (!c.actual) continue;
      const pb = Calc.periodBudget(c, timeline); if (!pb || pb.source === 'flat') continue;
      c.actual.budget = pb.budget; c.actual.budget_source = pb.source; c.actual.left = pb.left;
    }

    // bills: last payment = the previous due date, the electric bill planned two days early
    const bills = BILLS.map((b) => {
      const o = { ...b };
      let prev = onDay(T.getFullYear(), T.getMonth(), b.due_day); if (prev > T) prev = onDay(T.getFullYear(), T.getMonth() - 1, b.due_day);
      o.last_paid = { date: iso(prev), amount: b.amount, account: ACCT };
      if (b.id === 'electric') {
        let nx = onDay(T.getFullYear(), T.getMonth(), b.due_day); if (nx <= T) nx = onDay(T.getFullYear(), T.getMonth() + 1, b.due_day);
        const plan = add(nx, -2); if (plan >= T) o.next_payment = { date: iso(plan), due_date: iso(nx), amount: b.amount };
      }
      return o;
    });

    // the same defaults publish.js fills in, so the demo is exactly the published shape
    for (const c of categories) { c.protected = !!c.protected; c.placeholder = !!c.placeholder; }
    for (const b of bills) { b.protected = !!b.protected; b.placeholder = false; b.repeat = 'monthly'; }
    for (const p of dates) for (const it of p.items) it.protected = !!it.protected;
    for (const e of timeline) { e.direction = e.direction || (e.type === 'income' ? 'in' : 'out'); e.protected = !!e.protected; }

    const target = new Date(T.getFullYear() + 1, T.getMonth() > 5 ? 6 : 0, 1);
    const stamp = todayIso + 'T07:05:00';
    return {
      v: 1, sample: false, demo: true, updated_at: stamp,
      categories, bills,
      paychecks: { frequency: 'list', dates },
      savings_goal: { name: 'Braces fund', goal: 5800, balance: 2265, target_date: iso(target), placeholder: false, note: 'For Maya — a little every payday', icon: '🦷' },
      events, timeline, published_at: stamp,
    };
  }
  const api = { build };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.FDDemo = api;
})(typeof window !== 'undefined' ? window : this);
