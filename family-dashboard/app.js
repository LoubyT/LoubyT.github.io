/* Family Dashboard — vanilla JS. Network: same-origin data files + the relay (PIN unlock, refresh). */
'use strict';
(() => {
const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
const DATA_AAD = enc.encode('family-dashboard:data:v1');
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* ---------------- key: from the 4-digit PIN (pin-gate.js), held in memory only ---------------- */
let KEY = null; // { key: non-extractable CryptoKey, kid } — never stored on the phone

async function fetchJSON(url) {
  const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

async function decryptData(stored) {
  const env = await fetchJSON('data.enc');
  if (env.kid !== stored.kid) { const e = new Error('key changed'); e.code = 'KID'; throw e; }
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv), additionalData: DATA_AAD }, stored.key, b64(env.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---------------- dates ---------------- */
const DAY = 864e5;
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const dim = (y, m) => new Date(y, m + 1, 0).getDate();
const md = (x) => `${x.getMonth() + 1}/${x.getDate()}`;
const mdIso = (v) => md(parseD(v));
const fmtD = (d, o = { month: 'short', day: 'numeric' }) => d.toLocaleDateString('en-US', o);
function nextYearly(src, from) {
  const s = parseD(src); let d = new Date(from.getFullYear(), s.getMonth(), Math.min(s.getDate(), dim(from.getFullYear(), s.getMonth())));
  if (d < from) d = new Date(from.getFullYear() + 1, s.getMonth(), Math.min(s.getDate(), dim(from.getFullYear() + 1, s.getMonth())));
  return d;
}
function nextMonthly(day, from) {
  let y = from.getFullYear(), m = from.getMonth();
  let d = new Date(y, m, Math.min(day, dim(y, m)));
  if (d < from) { m++; if (m > 11) { m = 0; y++; } d = new Date(y, m, Math.min(day, dim(y, m))); }
  return d;
}
function paydaysIn(p, start, end) { // inclusive dates
  const out = []; if (!p) return out;
  if (p.frequency === 'list') return (p.dates || []).map((x) => parseD(x.date)).filter((d) => d >= start && d <= end);
  if (!p.anchor_date) return out;
  if (p.frequency === 'weekly' || p.frequency === 'biweekly') {
    const step = p.frequency === 'weekly' ? 7 : 14; const a = parseD(p.anchor_date);
    let n = Math.ceil(daysBetween(a, start) / step); let d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + n * step);
    while (d <= end) { out.push(d); n++; d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + n * step); }
  } else {
    const days = p.frequency === 'semimonthly' ? p.days : [parseD(p.anchor_date).getDate()];
    for (let y = start.getFullYear(), m = start.getMonth(); new Date(y, m, 1) <= end; m > 10 ? (m = 0, y++) : m++)
      for (const dd of days) { const d = new Date(y, m, Math.min(dd, dim(y, m))); if (d >= start && d <= end) out.push(d); }
  }
  return out;
}

/* ---------------- money ---------------- */
const usd = (n, cents) => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
const usdSmart = (n) => usd(n, Math.round(n) !== Math.round(n * 100) / 100);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHIELD = '<svg viewBox="0 0 16 16"><path d="M8 0l6.5 2.6v4.6c0 4.1-2.8 7.5-6.5 8.8C4.3 14.7 1.5 11.3 1.5 7.2V2.6z"/></svg>';
const badges = (o) => (o.protected ? `<span class="badge prot">${SHIELD}Protected</span>` : '') + (o.placeholder ? '<span class="badge ph">Placeholder</span>' : '');

/* ---------------- old on-phone spending: retired ----------------
 * Spending now comes from the budget tracker (categories[].actual). Entries a phone saved earlier are
 * deleted here and never read, so they can't show stale numbers. */
try { localStorage.removeItem('fd:spend:v1'); } catch {}

/* ---------------- svg ring ---------------- */
let gid = 0;
function ring(size, stroke, frac, colors, inner) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, id = 'g' + (++gid);
  const f = Math.max(0, Math.min(1, frac));
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs>
      <circle class="trk" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="url(#${id})"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" data-to="${c * (1 - f)}"/>
    </svg><div class="mid">${inner}</div></div>`;
}

/* ---------------- render ---------------- */
let DATA = null;
function render() {
  const d = DATA, t = today0(), now = new Date();
  const h = now.getHours();
  $('#hello').textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#today').textContent = fmtD(now, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#sampleBanner').hidden = !d.sample;

  /* countdowns */
  const cds = [];
  const plans = [];
  for (const e of d.events || []) {
    const when = e.repeat === 'yearly' ? nextYearly(e.date, t) : parseD(e.date);
    const end = e.end_date ? parseD(e.end_date) : when;
    const days = daysBetween(t, when); if (daysBetween(t, end) < 0) continue;
    const age = e.kind === 'birthday' ? when.getFullYear() - parseD(e.date).getFullYear() : null;
    (e.kind === 'birthday' ? cds : plans).push({ ...e, when, end, days: Math.max(0, days), age });
  }
  if (d.paychecks) {
    const pd = paydaysIn(d.paychecks, t, new Date(t.getFullYear(), t.getMonth() + 2, t.getDate()))[0];
    const hit = pd && d.paychecks.frequency === 'list' ? (d.paychecks.dates || []).find((x) => +parseD(x.date) === +pd) : null;
    const amt = hit ? hit.amount : d.paychecks.placeholder ? undefined : d.paychecks.amount;
    if (pd) cds.push({ id: 'payday', name: d.paychecks.label || 'Next payday', when: pd, days: daysBetween(t, pd), icon: '💵', kind: 'pay', budget: amt, note: amt != null ? 'take-home' : '' });
  }
  renderMoneyCard(d, t);
  renderPayNow(t);
  plans.sort((a, b) => a.when - b.when);
  const soon = plans.filter((x) => x.days <= 120);
  $('#plansSec').hidden = !soon.length;
  $('#plans').innerHTML = soon.map((x) => {
    const range = x.end_date ? `${fmtD(x.when)}–${x.end.getMonth() === x.when.getMonth() ? x.end.getDate() : fmtD(x.end)}` : fmtD(x.when, { weekday: 'short', month: 'short', day: 'numeric' });
    const amt = x.budget != null ? (x.estimated ? '~' : '') + usdSmart(x.budget) + ' · ' : '';
    const cls = x.days <= 1 ? 'now' : x.days <= 5 ? 'soon' : '';
    const lbl = x.days === 0 ? (x.end_date ? 'Now' : 'Today') : x.days === 1 ? 'Tomorrow' : `${x.days} days`;
    const ti = x.kind === 'birthday' ? -1 : (d.timeline || []).findIndex((e) => hasBreakdown(e) && e.name === x.name && e.date === x.date);
    const tag = ti >= 0 ? `button type="button" class="row reveal tap" data-ev="${ti}" aria-label="${esc(x.name)} — see breakdown"` : 'div class="row reveal"';
    return `<${tag}><div class="emoji">${esc(x.icon || '📅')}</div>
      <div class="grow"><div class="name">${esc(x.name)}</div><div class="sub">${amt}${range}${ti >= 0 ? ' · Tap for breakdown' : ''}</div></div><span class="pill ${cls}">${lbl}</span>${ti >= 0 ? '<span class="chev" aria-hidden="true">›</span></button>' : '</div>'}`;
  }).join('');
  cds.sort((a, b) => a.days - b.days);
  const PAL = [['#ff6fb5', '#b65cff'], ['#4da3ff', '#2ee6c5'], ['#ffb84d', '#ff6f91'], ['#3ddc84', '#4da3ff']];
  $('#countdowns').innerHTML = cds.map((c, i) => {
    const col = c.kind === 'pay' ? ['#3ddc84', '#2ee6c5'] : PAL[i % PAL.length];
    const span = c.kind === 'pay' ? 14 : 365;
    const isToday = c.days === 0;
    const inner = isToday ? `<div><div class="num">🎉</div><div class="unit">today</div></div>`
      : `<div><div class="num" data-count="${c.days}">0</div><div class="unit">${c.days === 1 ? 'day' : 'days'}</div></div>`;
    const tags = [];
    if (c.age) tags.push(`Turns ${c.age}`);
    if (c.budget != null) tags.push(`${usdSmart(c.budget)}${c.note ? ' ' + c.note.toLowerCase() : ''}`);
    const sparkles = c.kind === 'birthday' ? [0, 1, 2, 3].map((k) => `<i class="sparkle" style="left:${[14, 34, 6, 30][k]}px;top:${[10, 8, 96, 108][k]}px;animation-delay:${k * .7}s"></i>`).join('') : '';
    return `<article class="card cd reveal ${isToday ? 'today-cd' : ''}" style="--glow:${col[0]}">${sparkles}
      ${ring(96, 9, isToday ? 1 : Math.max(0.04, 1 - c.days / span), col, inner)}
      <div><h3>${esc(c.name)}</h3><div class="when">${fmtD(c.when, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      ${tags.map((x) => `<span class="tag">${esc(x)}</span>`).join(' ')}</div></article>`;
  }).join('') || '<div class="card empty">Nothing coming up</div>';

  /* bills — one row per bill (FDRecur.billNext): the feed's next_payment wins until its planned date passes */
  const bills = (d.bills || []).flatMap((b) => FDRecur.billRows(b, t).map((n) => ({ ...b, n, days: daysBetween(t, n.key), near: daysBetween(t, n.near) })))
    .filter((b) => b.days >= 0 && b.near <= 45).sort((a, b) => a.days - b.days || +a.n.due - +b.n.due);
  $('#billsSec').hidden = !(d.bills || []).length;
  const showAll = render.allBills, shown = showAll ? bills : bills.slice(0, 5);
  $('#bills').innerHTML = shown.map((b) => {
    const n = b.n, plannedAhead = n.planned && n.planned >= t, dueAhead = n.due >= t;
    const calm = n.afterDue; // planned after the due date: shown subtly, never as an alarm
    const cls = calm ? 'plan' : b.days <= 1 ? 'now' : b.days <= 5 ? 'soon' : '';
    const lbl = b.days === 0 ? 'Today' : b.days === 1 ? 'Tomorrow' : `${b.days} days`;
    const amt = n.amount == null ? 'Amount TBD' : exactMoney(n.amount);
    const lp = b.last_paid && b.last_paid.date ? parseD(b.last_paid.date) : null;
    const paid = lp && lp <= t && daysBetween(lp, t) <= 45 ? `<span class="paid">Last paid ${md(lp)}</span>` : '';
    const when = `due ${md(n.due)}${n.planned && (plannedAhead || dueAhead) && +n.planned !== +n.due ? ` · planned ${md(n.planned)}` : ''}`;
    const part = n.part ? ` · split ${n.part.n} of ${n.part.of}` : '';
    return `<div class="row reveal${calm ? ' after-due' : ''}"><div class="emoji">${FDLogos.logoHtml(b.name, b.icon)}</div>
      <div class="grow"><div class="name">${esc(b.name)}${badges(b)}</div><div class="sub">${esc(amt)} · ${when}${part}${b.autopay ? ' · autopay' : ''}${calm ? ' <span class="late-plan">· after due date</span>' : ''}</div>${paid ? `<div class="sub">${paid}</div>` : ''}</div>
      <span class="pill ${cls}">${lbl}</span></div>`;
  }).join('') + (bills.length > 5 ? `<button class="more" data-more>${showAll ? 'Show fewer' : `Show all ${bills.length} bills`}</button>` : '') || '<div class="empty">No bills due in the next 45 days 🎉</div>';

  /* budget (current calendar month) */
  const mStart = new Date(t.getFullYear(), t.getMonth(), 1), mEnd = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  $('#monthName').textContent = fmtD(t, { month: 'long', year: 'numeric' });
  let totB = 0, hasPh = false;
  const todayIso = isoDay(t);
  const catHtml = (d.categories || []).map((c, ci) => {
    const s = c.starts_on ? parseD(c.starts_on) : null, e = c.ends_on ? parseD(c.ends_on) : null;
    const actStart = s && s > mStart ? s : mStart, actEnd = e && e < mEnd ? new Date(e.getTime() + DAY) : mEnd;
    const activeDays = Math.max(0, daysBetween(actStart, actEnd));
    const notYet = s && s > t;
    let budget = null;
    if (c.amount != null) {
      if (c.period === 'week') budget = c.amount * activeDays / 7;
      else if (c.period === 'month') budget = activeDays ? c.amount : 0;
      else budget = c.amount * (d.paychecks ? paydaysIn(d.paychecks, actStart, new Date(actEnd - DAY)).length : 26 / 12);
      budget = c.period === 'month' ? Math.round(budget * 100) / 100 : Math.round(budget);
    }
    if (budget != null) totB += budget; else hasPh = true;
    const per = c.period === 'week' ? '/week' : c.period === 'month' ? '/month' : '/paycheck';
    const meta = (c.amount != null ? usdSmart(c.amount) + per : 'Amount TBD') + (notYet ? ` · starts ${fmtD(s)}` : '');
    const st = actualStatus(c, todayIso);
    const head = `<div class="info"><h3>${esc(c.icon ? c.icon + ' ' : '')}${esc(c.name)}${badges(c)}</h3><div class="meta">${meta}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}`;
    if (st) {
      const f = st.frac, col = f > 1 ? ['#ff5d6c', '#ff8a5d'] : f > .8 ? ['#ffb84d', '#ff8a5d'] : ['#2ee6c5', '#4da3ff'];
      const pctTxt = st.plan ? Math.round(f * 100) + '%' : '—';
      return `<article class="card cat tap reveal${st.stale ? ' stale' : ''}" data-cat="${ci}" role="button" tabindex="0" aria-label="${esc(c.name)} — see purchases">
        ${ring(84, 9, f, col, `<div class="pct">${pctTxt}<small>used</small></div>`)}
        ${head}<div class="nums"><span>Spent <b>${esc(exactMoney(st.spent))}</b></span>${st.left != null ? `<span>Left <b class="${st.left < 0 ? 'over' : ''}">${esc(exactMoney(st.left))}</b></span>${st.plan != null ? `<span>of ${esc(exactMoney(st.plan))}</span>` : ''}` : ''}</div>
        ${st.note ? `<div class="act-note">${esc(st.note)}</div>` : ''}
        <div class="asof">as of ${esc(asOfTxt(c.actual.as_of))}</div>
        ${st.stale ? `<div class="stale-note">${staleTxt(st, c.actual, c.period)}</div>` : ''}</div>
        <span class="chev cat-chev" aria-hidden="true">›</span></article>`;
    }
    return `<article class="card cat plan-only reveal ${notYet && activeDays === 0 ? 'inactive' : ''}">
      ${ring(84, 9, 0, ['#2ee6c5', '#4da3ff'], `<div class="pct">${budget == null ? '—' : esc(usd(budget))}<small>plan</small></div>`)}
      ${head}<div class="nums">${notYet && activeDays === 0 ? `<span>Starts ${fmtD(s, { month: 'long', day: 'numeric' })}</span>` : budget == null ? '<span>Plan amount TBD</span>' : `<span>Planned this month <b>${usd(budget)}</b></span>`}</div></div></article>`;
  }).join('');
  $('#cats').innerHTML = catHtml;
  const tr = trackedTotals(d.categories, todayIso), tf = tr.plan ? tr.spent / tr.plan : 0;
  $('#summary').innerHTML = `${ring(104, 11, tf, tf > 1 ? ['#ff5d6c', '#ff8a5d'] : ['#8b7bff', '#ff6fb5'], `<div class="pct">${tr.lines && tr.plan ? Math.round(tf * 100) + '%' : '—'}<small>used</small></div>`)}
    <div><div class="lbl">Planned this month</div><div class="big" data-money="${totB}">${usd(0)}</div>
    ${!tr.lines && tr.upcoming ? `<div class="lbl" style="margin-top:8px">Tracking starts ${esc(rawDate(tr.nextStart))} · from the budget tracker</div>` : ''}
    ${tr.lines ? `<div class="bar3"><div>Spent so far<b>${esc(exactMoney(tr.spent))}</b></div><div>Of plan<b>${esc(exactMoney(tr.plan))}</b></div></div>
      <div class="lbl" style="margin-top:8px">From the budget tracker · ${tr.lines} ${tr.lines === 1 ? 'line' : 'lines'} tracked</div>`
      : tr.upcoming ? '' : '<div class="lbl" style="margin-top:8px">Spending will show here once the budget tracker sends it.</div>'}
    ${hasPh ? '<div class="lbl" style="margin-top:8px">Some amounts are still placeholders.</div>' : ''}</div>`;
  $('#summary').classList.add('reveal');

  /* dental fund */
  const df = d.dental_fund;
  $('#dentalSec').hidden = !df;
  if (df) {
    const bal = df.balance ?? 0, goal = df.goal, td = parseD(df.target_date);
    const daysLeft = Math.max(0, daysBetween(t, td)), weeks = Math.max(1, daysLeft / 7), months = Math.max(1, daysLeft / 30.44);
    const need = Math.max(0, goal - bal), frac = goal ? bal / goal : 0;
    $('#dental').innerHTML = `<h3>🦷 ${esc(df.name || 'Savings goal')}${df.placeholder ? '<span class="badge ph">Balance TBD</span>' : ''}</h3>
      <div class="sub">Goal ${usd(goal)} by ${fmtD(td, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      <div class="amt"><b data-money="${bal}">${usd(0)}</b><span>saved of ${usd(goal)}</span></div>
      <div class="track"><i data-w="${Math.min(100, frac * 100)}"></i></div>
      <div class="ticks"><span>${usd(0)}</span><span>${usd(goal / 2)}</span><span>${usd(goal)}</span></div>
      <div class="pace"><div>Still needed<b>${usd(need)}</b></div><div>Per week<b>${usdSmart(Math.ceil(need / weeks * 100) / 100)}</b></div><div>Per month<b>${usd(Math.ceil(need / months))}</b></div><div>Days left<b>${daysLeft}</b></div></div>
      ${df.note ? `<div class="sub" style="margin-top:10px">${esc(df.note)}</div>` : ''}`;
    $('#dental').classList.add('reveal');
  }

  $('#updated').textContent = lastUpdatedText(d.updated_at || d.published_at);
  if (typeof lrRender === 'function') lrRender();
  $('#foot').textContent = 'Private & encrypted';
  animateIn();
}

function lastUpdatedText(iso) {
  if (!iso) return '';
  const u = new Date(iso); if (isNaN(u)) return '';
  const t = today0(), ud = new Date(u); ud.setHours(0, 0, 0, 0);
  const diff = daysBetween(ud, t), time = u.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = diff === 0 ? 'today' : diff === 1 ? 'yesterday' : fmtD(u, { weekday: diff < 7 ? 'short' : undefined, month: 'short', day: 'numeric' });
  return `Last updated ${day} at ${time}`;
}

function animateIn() {
  const els = document.querySelectorAll('.reveal:not(.in)');
  els.forEach((el, i) => setTimeout(() => {
    el.classList.add('in');
    el.querySelectorAll('.val[data-to]').forEach((c) => { c.style.strokeDashoffset = c.dataset.to; });
    el.querySelectorAll('[data-w]').forEach((b) => { b.style.width = b.dataset.w + '%'; });
    el.querySelectorAll('[data-count]').forEach((n) => countUp(n, +n.dataset.count, (v) => String(Math.round(v))));
    el.querySelectorAll('[data-money]').forEach((n) => countUp(n, +n.dataset.money, (v) => usd(v)));
  }, 60 + i * 55));
}
function countUp(el, to, fmt) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 1100;
  const step = (tm) => { const p = Math.min(1, (tm - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(to * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}


/* ---------------- timeline ----------------
 * Totals rules (never double count):
 *  - type "event" rows are informational (trip summaries AND their line items) → never counted
 *  - type "transfer" rows move money between our own accounts → never counted
 *  - income/in → "in"; bill/spending/out → "out"; savings/out → "saved"
 */
const TL_ICON = { income: '💵', bill: '🧾', spending: '🛒', savings: '🐷', transfer: '⇄', event: 'ⓘ' };
const { tlBucket, tlTotals, exactMoney, breakdownCheck } = FDCalc;
const upcoming = (d, t) => (d.timeline || []).filter((e) => parseD(e.end_date || e.date) >= t);
const hasBreakdown = (e) => e && e.type === 'event' && Array.isArray(e.breakdown) && e.breakdown.length > 0;
function tlRow(e, opts = {}) {
  const b = tlBucket(e), cls = e.type === 'event' ? 'info' : e.type === 'transfer' ? 'move' : b === 'in' ? 'in' : 'out';
  const idx = DATA && DATA.timeline ? DATA.timeline.indexOf(opts.src || e) : -1;
  const tap = hasBreakdown(opts.src || e) && idx >= 0;
  const est = e.estimated ? '~' : '';
  const sign = cls === 'in' ? '+' : cls === 'out' ? '−' : '';
  const amt = e.amount == null ? 'TBD' : est + sign + exactMoney(e.amount);
  const subs = [];
  if (e.due_date && e.due_date !== e.date) subs.push('due ' + fmtD(parseD(e.due_date)) + (e.date > e.due_date ? ' (paid after due date)' : ''));
  if (e.end_date) subs.push('through ' + fmtD(parseD(e.end_date)));
  if (e.type === 'event') subs.push('info only');
  if (e.type === 'transfer') subs.push('moving money');
  if (e.account) subs.push(e.account);
  if (e.note) subs.push(e.note);
  const bal = e.balance_after != null ? `<span class="bal">bal ${exactMoney(e.balance_after)}</span>` : '';
  const open = tap ? `<button type="button" class="row ${cls} tap" data-ev="${idx}" aria-label="${esc(e.name)} — see breakdown">` : `<div class="row ${cls}">`;
  const close = tap ? '<span class="chev" aria-hidden="true">›</span></button>' : '</div>';
  if (tap) subs.unshift('Tap for breakdown');
  return `${open}<div class="emoji">${e.type === 'bill' ? FDLogos.logoHtml(e.name) : TL_ICON[e.type] || '•'}</div>
    <div class="grow"><div class="name">${esc(e.name)}${e.protected ? `<span class="badge prot">${SHIELD}Protected</span>` : ''}${e.estimated ? '<span class="badge est">Estimate</span>' : ''}</div>
    <div class="sub">${esc(subs.join(' · '))}</div></div>
    <div class="amt ${cls}">${esc(amt)}${bal}</div>${close}`;
}
function renderMoneyCard(d, t) {
  const up = upcoming(d, t);
  $('#moneySec').hidden = !up.length;
  if (!up.length) return;
  const end = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 14);
  const next = up.filter((e) => parseD(e.date) < end);
  const tot = tlTotals(next);
  let low = null;
  for (const e of next) if (e.balance_after != null && (low === null || e.balance_after < low.balance_after)) low = e;
  const preview = next.filter((e) => e.type !== 'transfer').slice(0, 3);
  $('#money').innerHTML = `<div class="mstats"><div class="in">Coming in<b>+${usd(tot.in)}</b></div><div>Going out<b>−${usd(tot.out)}</b></div><div>Saved<b>${usd(tot.saved)}</b></div></div>
    ${low ? `<p class="mlow">Lowest balance: <b>${exactMoney(low.balance_after)}</b> on ${fmtD(parseD(low.date), { weekday: 'short', month: 'short', day: 'numeric' })}</p>` : ''}
    ${preview.length ? `<div class="list">${preview.map((e) => tlRow({ ...e, note: undefined, account: undefined }, { src: e })).join('')}</div>` : ''}
    <button class="see-all" type="button" data-timeline>See full timeline →</button>`;
  $('#money').classList.add('reveal');
}

let tlWeeks = 3;
function weekStart(dt) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - dt.getDay()); }
function renderTimeline() {
  if (!DATA) return;
  const t = today0(), up = upcoming(DATA, t);
  const first = weekStart(t), cutoff = new Date(first.getFullYear(), first.getMonth(), first.getDate() + tlWeeks * 7);
  const shown = up.filter((e) => parseD(e.date) < cutoff);
  const weeks = new Map();
  for (const e of shown) {
    const dd = parseD(e.date) < t ? t : parseD(e.date); // multi-day item that started earlier → show today
    const wk = +weekStart(dd); if (!weeks.has(wk)) weeks.set(wk, new Map());
    const days = weeks.get(wk), key = +dd; if (!days.has(key)) days.set(key, []); days.get(key).push(e);
  }
  const html = [];
  for (const [wk, days] of weeks) {
    const ws = new Date(wk), diffW = Math.round(daysBetween(first, ws) / 7);
    const title = diffW === 0 ? 'This week' : diffW === 1 ? 'Next week' : 'Week of ' + fmtD(ws);
    const tot = tlTotals([...days.values()].flat());
    html.push(`<section class="wk"><div class="wk-head"><h2>${title}</h2><span class="wk-tot"><span class="g">+${usd(tot.in)}</span> in · −${usd(tot.out)} out${tot.saved ? ` · ${usd(tot.saved)} saved` : ''}</span></div><div class="card list">`);
    for (const [day, items] of days) {
      const dd = new Date(day), n = daysBetween(t, dd);
      const lbl = (n === 0 ? 'Today · ' : n === 1 ? 'Tomorrow · ' : '') + fmtD(dd, { weekday: 'long', month: 'short', day: 'numeric' });
      html.push(`<div class="day ${n === 0 ? 'today' : ''}">${lbl}</div>` + items.map((e) => tlRow(e)).join(''));
    }
    html.push('</div></section>');
  }
  $('#tlList').innerHTML = html.join('') || '<div class="card empty">Nothing planned yet.</div>';
  const more = up.some((e) => parseD(e.date) >= cutoff);
  $('#tlMore').hidden = !more; $('#tlEnd').hidden = more || !up.length;
}
let tlScroll = 0;
function showTimeline(on) {
  if (on && !DATA) return;
  if (on) { tlScroll = scrollY; tlWeeks = 3; renderTimeline(); $('#app').hidden = true; $('#tlView').hidden = false; scrollTo(0, 0); }
  else if (!$('#tlView').hidden) { $('#tlView').hidden = true; $('#app').hidden = false; scrollTo(0, tlScroll); }
}
addEventListener('hashchange', () => showTimeline(location.hash === '#timeline'));
$('#tlBack').addEventListener('click', () => { if (location.hash === '#timeline') history.back(); else showTimeline(false); });
$('#tlMore').addEventListener('click', () => { tlWeeks += 3; renderTimeline(); });
if ('IntersectionObserver' in window) {
  new IntersectionObserver((ents) => { if (ents[0].isIntersecting && !$('#tlView').hidden && !$('#tlMore').hidden) { tlWeeks += 3; renderTimeline(); } }, { rootMargin: '200px' }).observe($('#tlMore'));
}


/* ---------------- event breakdown sheet ---------------- */
const rawDate = (v) => { if (typeof v !== 'string') return ''; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v} (${parseD(v).toLocaleDateString('en-US', { weekday: 'short' })})` : v; };
let evOpen = false;
function openEvent(idx) {
  const e = DATA && DATA.timeline && DATA.timeline[idx];
  if (!hasBreakdown(e)) return;
  const chk = breakdownCheck(e);
  const items = e.breakdown.map((it) => `<li><div class="bi-main"><span class="bi-name">${esc(it.item)}</span><span class="bi-amt">${esc(exactMoney(it.amount))}</span></div>${it.when || it.note ? `<div class="bi-sub">${esc([it.when ? rawDate(it.when) : '', it.note || ''].filter(Boolean).join(' · '))}</div>` : ''}</li>`).join('');
  const diff = chk && !chk.matches ? `<p class="ev-diff">Note: the items add up to ${esc(exactMoney(chk.sumCents / 100))}, and the event total is ${e.amount == null ? 'not set' : esc(exactMoney(e.amount))}. Both are shown exactly as planned.</p>` : '';
  $('#evBody').innerHTML = `<h3 id="evTitle">${esc(e.name)}</h3>
    <p class="ev-date">${esc(rawDate(e.date))}${e.end_date ? ' → ' + esc(rawDate(e.end_date)) : ''}</p>
    <div class="ev-total"><span>Total</span><b>${e.amount == null ? 'TBD' : (e.estimated ? '~' : '') + esc(exactMoney(e.amount))}</b></div>
    ${e.funding ? `<div class="ev-fund"><span>Paid with</span><b>${esc(e.funding)}</b></div>` : ''}
    <h4 class="ev-h">Breakdown</h4><ul class="ev-items">${items}</ul>${diff}
    <p class="ev-foot">Info only — not added to the totals.</p>`;
  showSheet();
}
function showSheet() {
  const wrap = $('#evWrap'); wrap.hidden = false; $('#evSheet').style.transform = ''; $('#evSheet').scrollTop = 0;
  if (!evOpen) { evOpen = true; history.pushState({ fdSheet: 'ev' }, ''); }
  setTimeout(() => $('#evClose').focus({ preventScroll: true }), 50);
}
function hideEvent() { $('#evWrap').hidden = true; evOpen = false; }
function closeEvent() { if (!evOpen) return; if (history.state && history.state.fdSheet === 'ev') history.back(); else hideEvent(); }
addEventListener('popstate', () => { if (evOpen) hideEvent(); });
document.addEventListener('click', (e) => {
  const ev = e.target.closest('[data-ev]'); if (ev) { openEvent(+ev.dataset.ev); return; }
  const pc = e.target.closest('[data-pc]'); if (pc) { openPaycheck(+pc.dataset.pc); return; }
  const cat = e.target.closest('[data-cat]'); if (cat) { openCategory(+cat.dataset.cat); return; }
  if (e.target.closest('[data-paychecks]')) { location.hash = '#paychecks'; return; }
  if (e.target.closest('[data-evclose]')) closeEvent();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && evOpen) closeEvent();
  const cat = (e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-cat]');
  if (cat) { e.preventDefault(); openCategory(+cat.dataset.cat); }
});
// swipe down to close
(() => {
  const sh = $('#evSheet'); let y0 = null, dy = 0;
  sh.addEventListener('touchstart', (e) => { if (sh.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; } }, { passive: true });
  sh.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener('touchend', () => { if (y0 === null) return; y0 = null; sh.style.transition = ''; if (dy > 90) closeEvent(); else sh.style.transform = ''; });
})();


/* ---------------- paychecks ---------------- */
const { paycheckCheck, pickCurrentPaycheck } = FDCalc;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const payList = () => (DATA && DATA.paychecks && DATA.paychecks.frequency === 'list' ? DATA.paychecks.dates || [] : []);
const pcHasDetail = (p) => p && (Array.isArray(p.items) || typeof p.total_out === 'number' || typeof p.left_over === 'number');
const PC_TYPE = { bill: 'Bill', spending: 'Spending', savings: 'Savings', transfer: 'Moving money', event: 'Event', fee: 'Fee' };
const signed = (n) => (typeof n === 'number' ? exactMoney(n) : '—');
function pcStats(p) {
  return `<div class="pc-stats">${p.amount != null ? `<div>Amount<b>${esc(exactMoney(p.amount))}</b></div>` : ''}
    ${typeof p.total_out === 'number' ? `<div>Total out<b>${esc(exactMoney(p.total_out))}</b></div>` : ''}
    ${typeof p.left_over === 'number' ? `<div class="${p.left_over < 0 ? 'neg' : 'pos'}">Left over<b>${esc(signed(p.left_over))}</b></div>` : ''}</div>`;
}
function renderPayNow(t) {
  const list = payList(), i = pickCurrentPaycheck(list, isoDay(t));
  $('#paySec').hidden = i < 0;
  if (i < 0) return;
  const p = list[i], upcoming = p.date > isoDay(t);
  $('#hPay').textContent = upcoming ? 'Next paycheck' : 'This paycheck';
  const detail = pcHasDetail(p);
  $('#payNow').innerHTML = `${detail ? `<button type="button" class="pc-hit" data-pc="${i}" aria-label="Paycheck ${esc(p.date)} — see details">` : '<div class="pc-hit">'}
      <div class="pc-head"><span class="pc-date">💵 ${esc(rawDate(p.date))}${p.label ? ` <span class="pc-label">Check ${esc(p.label)}</span>` : ''}</span>${detail ? '<span class="chev" aria-hidden="true">›</span>' : ''}</div>
      ${p.period_end ? `<div class="pc-period">Covers through ${esc(rawDate(p.period_end))}</div>` : ''}
      ${pcStats(p)}
      ${p.low_point ? `<div class="pc-low">Low point: <b>${esc(exactMoney(p.low_point.balance))}</b> on ${esc(rawDate(p.low_point.date))}</div>` : ''}
    ${detail ? '</button>' : '</div>'}
    <button class="see-all" type="button" data-paychecks>All paychecks →</button>`;
  $('#payNow').classList.add('reveal');
}
function renderPaychecks() {
  const list = payList(), t = today0(), cur = pickCurrentPaycheck(list, isoDay(t));
  $('#pcList').innerHTML = list.map((p, i) => {
    const detail = pcHasDetail(p), past = i < cur, tag = detail ? `button type="button" data-pc="${i}"` : 'div';
    return `<${tag} class="card pc-card${i === cur ? ' current' : ''}${past ? ' past' : ''}" id="pc-${i}">
      <div class="pc-head"><span class="pc-date">${esc(rawDate(p.date))}${p.label ? ` <span class="pc-label">Check ${esc(p.label)}</span>` : ''}</span>
      ${i === cur ? `<span class="badge cur">${p.date > isoDay(t) ? 'Next' : 'This paycheck'}</span>` : past ? '<span class="badge past">Past</span>' : ''}${detail ? '<span class="chev" aria-hidden="true">›</span>' : ''}</div>
      ${pcStats(p)}</${detail ? 'button' : 'div'}>`;
  }).join('') || '<div class="card empty">No paychecks yet.</div>';
  return cur;
}
function openPaycheck(i) {
  const p = payList()[i]; if (!pcHasDetail(p)) return;
  const chk = paycheckCheck(p), items = p.items || [];
  const rows = items.map((it) => {
    const mv = it.type === 'transfer';
    const due = it.due_date && it.due_date !== it.date ? `due ${mdIso(it.due_date)}${it.date > it.due_date ? ' (after due date)' : ''}` : '';
    const sub = [rawDate(it.date), due, it.account, it.note].filter(Boolean).join(' · ');
    return `<li class="${mv ? 'mv' : ''}"><div class="bi-main"><span class="bi-name">${it.type === 'bill' ? `<span class="emoji mini">${FDLogos.logoHtml(it.name)}</span>` : ''}${esc(it.name)}${it.protected ? `<span class="badge prot">${SHIELD}Protected</span>` : ''}</span>
      <span class="bi-amt">${it.amount == null ? 'TBD' : (it.estimated ? '~' : '') + esc(exactMoney(it.amount))}</span></div>
      <div class="bi-sub"><span class="pc-type ${mv ? 'mv' : ''}">${mv ? '⇄ Moving money · not in total out' : PC_TYPE[it.type] || it.type}</span>${sub ? ' · ' + esc(sub) : ''}</div></li>`;
  }).join('');
  const oi = (p.other_income || []).map((o) => `<li><div class="bi-main"><span class="bi-name">${esc(o.name || 'Other income')}</span><span class="bi-amt pos">${o.amount == null ? 'TBD' : (o.estimated ? '~' : '') + '+' + esc(exactMoney(o.amount))}</span></div>${o.date || o.account || o.note ? `<div class="bi-sub">${esc([o.date ? rawDate(o.date) : '', o.account, o.note].filter(Boolean).join(' · '))}</div>` : ''}</li>`).join('');
  const diff = chk && !chk.matches ? `<p class="ev-diff">Note: the items (not counting moving money) add up to ${esc(exactMoney(chk.sumCents / 100))}, and total out is ${chk.totalCents === null ? 'not set' : esc(exactMoney(p.total_out))}. Both are shown exactly as planned.</p>` : '';
  $('#evBody').innerHTML = `<h3 id="evTitle">Paycheck${p.label ? ' ' + esc(p.label) : ''}</h3>
    <p class="ev-date">${esc(rawDate(p.date))}${p.period_end ? ' → ' + esc(rawDate(p.period_end)) : ''}</p>
    ${p.amount != null ? `<div class="ev-total"><span>Check amount</span><b>${esc(exactMoney(p.amount))}</b></div>` : ''}
    ${p.note ? `<p class="bi-sub" style="margin:0 4px 8px">${esc(p.note)}</p>` : ''}
    ${items.length ? `<h4 class="ev-h">Where it goes</h4><ul class="ev-items">${rows}</ul>` : ''}
    <div class="pc-sum">
      ${typeof p.total_out === 'number' ? `<div><span>Total out</span><b>${esc(exactMoney(p.total_out))}</b></div>` : ''}
      ${typeof p.left_over === 'number' ? `<div class="${p.left_over < 0 ? 'neg' : 'pos'}"><span>Left over</span><b>${esc(signed(p.left_over))}</b></div>` : ''}
      ${p.low_point ? `<div><span>Low point</span><b>${esc(exactMoney(p.low_point.balance))}<small>${esc(rawDate(p.low_point.date))}${p.low_point.account ? ' · ' + esc(p.low_point.account) : ''}</small></b></div>` : ''}
    </div>
    ${diff}
    ${oi ? `<h4 class="ev-h">Other income</h4><ul class="ev-items">${oi}</ul>` : ''}`;
  showSheet();
}
/* ---------------- category actuals (from the budget file) ---------------- */
const { actualStatus, trackedTotals } = FDCalc;
function asOfTxt(v) {
  if (typeof v !== 'string') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return rawDate(v);
  const d = new Date(v); if (isNaN(d)) return v;
  return `${rawDate(isoDay(d))} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}
const PER_WORD = { week: 'week', month: 'month', paycheck: 'paycheck' };
function staleTxt(st, a, period) {
  return st.stale === 'ended' ? `These numbers are from the previous ${PER_WORD[period] || 'period'} (ended ${esc(rawDate(a.period_end))}).`
    : `These numbers are from the previous period. Last update was before ${esc(rawDate(a.period_start))}.`;
}
function openCategory(i) {
  const c = DATA && DATA.categories && DATA.categories[i];
  const st = actualStatus(c, isoDay(today0())); if (!st) return;
  const a = c.actual;
  const rows = st.transactions.map((x) => `<li><div class="bi-main"><span class="bi-name">${esc(x.merchant)}</span><span class="bi-amt">${x.amount == null ? 'TBD' : esc(exactMoney(x.amount))}</span></div>
    <div class="bi-sub">${esc([rawDate(x.date), x.account].filter(Boolean).join(' · '))}</div></li>`).join('');
  $('#evBody').innerHTML = `<h3 id="evTitle">${esc(c.icon ? c.icon + ' ' : '')}${esc(c.name)}</h3>
    <p class="ev-date">${esc(rawDate(a.period_start))} → ${esc(rawDate(a.period_end))}</p>
    <div class="ev-total"><span>Spent</span><b>${esc(exactMoney(st.spent))}</b></div>
    <div class="pc-sum">
      ${st.plan != null ? `<div><span>Plan</span><b>${esc(exactMoney(st.plan))}</b></div>` : ''}
      ${st.left != null ? `<div class="${st.left < 0 ? 'neg' : 'pos'}"><span>Left</span><b>${esc(exactMoney(st.left))}</b></div>` : ''}
    </div>
    ${st.note ? `<p class="act-note sheet">${esc(st.note)}</p>` : ''}
    <p class="cat-asof">as of ${esc(asOfTxt(a.as_of))}</p>
    ${st.stale ? `<p class="stale-note">${staleTxt(st, a, c.period)}</p>` : ''}
    <h4 class="ev-h">Purchases</h4>
    ${rows ? `<ul class="ev-items">${rows}</ul>` : `<p class="bi-sub" style="margin:0 4px 8px">${st.upcoming ? 'This period hasn’t started yet.' : 'No purchases yet this period.'}</p>`}
    <p class="ev-foot">From the budget tracker.</p>`;
  showSheet();
}
let pcScroll = 0;
function showPaychecks(on) {
  if (on && !DATA) return;
  if (on) {
    pcScroll = scrollY; const cur = renderPaychecks(); $('#app').hidden = true; $('#tlView').hidden = true; $('#pcView').hidden = false;
    requestAnimationFrame(() => { const el = $('#pc-' + cur); if (el && cur > 0) { const y = el.getBoundingClientRect().top + scrollY - 80; scrollTo(0, Math.max(0, y)); } else scrollTo(0, 0); });
  } else if (!$('#pcView').hidden) { $('#pcView').hidden = true; $('#app').hidden = false; scrollTo(0, pcScroll); }
}
$('#pcBack').addEventListener('click', () => { if (location.hash === '#paychecks') history.back(); else showPaychecks(false); });
addEventListener('hashchange', () => showPaychecks(location.hash === '#paychecks'));

let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-more],[data-timeline]'); if (!t) return;
  if ('timeline' in t.dataset) { location.hash = '#timeline'; }
  else if ('more' in t.dataset) { render.allBills = !render.allBills; refreshView(); }
});
function refreshView() { const y = scrollY; render(); if (!$('#tlView').hidden) renderTimeline(); if (!$('#pcView').hidden) renderPaychecks(); scrollTo(0, y); }

/* ---------------- boot / lock (4-digit PIN, checked by the relay; see pin-gate.js) ---------------- */
function showLock() { location.reload(); } // the key changed or got lost: start over (asks for the PIN again)
function showApp() { $('#app').hidden = false; render(); if (location.hash === '#timeline') showTimeline(true); else if (location.hash === '#paychecks') showPaychecks(true); }

function boot() {
  PinGate.start({
    title: 'Family Dashboard', icon: 'icons/icon-192.png', theme: 'dark', lockMount: '.top-btns',
    onKey: async (key, kid) => { const k = { key, kid }; DATA = await decryptData(k); KEY = k; lastCheck = Date.now(); showApp(); },
  });
}

/* ---------------- refresh: button, pull-to-refresh, foreground, timer ---------------- */
let refreshing = false, lastCheck = 0;
const sig = (d) => d ? (d.published_at || '') + '|' + (d.updated_at || '') : '';
async function refreshData({ silent = false } = {}) {
  if (refreshing || !DATA) return; refreshing = true; lastCheck = Date.now();
  const btn = $('#refreshTop'); btn.classList.add('spin');
  if (!silent) $('#app').classList.add('refreshing');
  try {
    if (!KEY) return;
    const fresh = await decryptData(KEY); // data.enc?t=<now>, cache:'no-store'; SW is network-first for it
    const changed = sig(fresh) !== sig(DATA);
    DATA = fresh;
    if (changed || !silent) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.remove('in'));
      await new Promise((r) => setTimeout(r, silent ? 0 : 180));
      refreshView();
      if (changed) { const u = $('#updated'); u.classList.add('fresh'); setTimeout(() => u.classList.remove('fresh'), 2500); }
    }
    if (!silent) toast(changed ? 'New numbers loaded' : 'Already up to date');
    else if (changed) toast('Numbers updated');
  } catch (e) {
    if (e.code === 'KID') { DATA = null; KEY = null; return showLock(); }
    if (!silent) toast(navigator.onLine === false ? 'You’re offline — showing the last numbers' : 'Couldn’t refresh — try again in a bit');
  } finally { refreshing = false; btn.classList.remove('spin'); $('#app').classList.remove('refreshing'); }
}
$('#refreshTop').addEventListener('click', () => { checkForUpdate(); onRefreshTap(); });

/* ---------------- live refresh: ↻ asks the updater to rebuild the numbers ----------------
 * The webhook URL + key live ONLY in the encrypted data (DATA.refresh), so only unlocked phones have them.
 * One tap → one POST. A successful request disables ↻ for 30 min (cooldown, shared across phones through the
 * published last_refresh_request when the updater records it; per-phone otherwise via localStorage). While the update
 * runs we poll data.enc every 45 s until published_at is newer than the tap, then show the new time. After 15 min
 * without new data: "Still waiting — try again later". If the request is blocked or refused we say so and only
 * re-fetch the current numbers — never pretend it worked. Pull-to-refresh stays a plain re-fetch. */
const LR_KEY = 'fd:refresh:tap';
let lrTimer = null, lrNote = '';
const lrCfg = () => (DATA && DATA.refresh && DATA.refresh.url ? DATA.refresh : null);
const hm = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function lrState(now = Date.now()) {
  let tap = ''; try { tap = localStorage.getItem(LR_KEY) || ''; } catch {}
  return FDCalc.refreshState({ cfg: lrCfg(), tap, shared: DATA && DATA.last_refresh_request, published: DATA && DATA.published_at, now });
}
function lrRender() {
  const st = lrState(), btn = $('#refreshTop'), el = $('#refreshStatus');
  const lock = st.kind === 'updating' || st.kind === 'cooldown' || st.kind === 'late';
  btn.disabled = lock; btn.classList.toggle('lr-busy', st.kind === 'updating'); btn.setAttribute('aria-disabled', String(lock));
  btn.setAttribute('aria-label', st.kind === 'off' ? 'Refresh numbers' : lock ? 'Refresh not available yet' : 'Update the numbers now');
  let msg = lrNote;
  if (st.kind === 'updating') msg = 'Updating… this takes a few minutes';
  else if (st.kind === 'late') msg = `Still waiting — try again later. Next refresh available at ${hm(st.next)}`;
  else if (st.kind === 'cooldown') msg = `Next refresh available at ${hm(st.next)}`;
  el.textContent = msg; el.hidden = !msg; el.classList.toggle('warn', !!lrNote && !lock);
  clearInterval(lrTimer); lrTimer = null;
  if (st.kind === 'updating') lrTimer = setInterval(lrPoll, 45e3);
  else if (lock) lrTimer = setInterval(lrRender, 30e3); // re-enable when the cooldown ends
}
async function lrPoll() {
  if (document.hidden) return;
  const before = Date.parse(DATA && DATA.published_at) || 0;
  await refreshData({ silent: true });
  const after = Date.parse(DATA && DATA.published_at) || 0;
  if (after > before && lrState().kind !== 'updating') toast('New numbers are in');
  lrRender();
}
async function onRefreshTap() {
  const cfg = lrCfg();
  if (!cfg) return refreshData();                       // no live refresh configured → plain re-fetch
  if (lrState().kind !== 'idle') return lrRender();
  const btn = $('#refreshTop'); btn.disabled = true; btn.classList.add('spin'); lrNote = '';
  $('#refreshStatus').textContent = 'Asking for an update…'; $('#refreshStatus').hidden = false;
  let status = 0, next = 0;
  try {
    // the relay adds the credentials server-side; the phone sends only a tiny body
    const r = await fetch(cfg.url, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'family-dashboard' }) });
    status = r.status;
    if (status === 429) { try { const j = await r.json(); next = Date.parse(j && j.next_at) || 0; } catch {} }
  } catch { status = 0; }                                 // network error or blocked by the browser (CORS)
  try { sessionStorage.setItem('fd:refresh:last', JSON.stringify({ status, at: new Date().toISOString() })); } catch {}
  btn.classList.remove('spin');
  if (status >= 200 && status < 300) {
    try { localStorage.setItem(LR_KEY, new Date().toISOString()); } catch {}
    lrRender(); return;
  }
  lrNote = status === 0 ? 'Couldn’t start an update from this phone (the request was blocked). Showing the latest numbers instead.'
    : status === 429 ? `An update was asked for recently${next ? ` — next refresh available at ${hm(next)}` : ''}. Showing the latest numbers.`
    : `The updater didn’t accept the request (error ${status}). Showing the latest numbers instead.`;
  lrRender(); await refreshData(); lrRender();
}
// back to the foreground -> check for new data (at most once a minute)
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 60e3) refreshData({ silent: true }); });
addEventListener('pageshow', (e) => { if (e.persisted) refreshData({ silent: true }); });
addEventListener('online', () => refreshData({ silent: true }));
// while open, re-check every 15 min (data is republished every ~2 h)
setInterval(() => { if (!document.hidden) refreshData({ silent: true }); }, 15 * 60e3);

// pull-to-refresh (touch devices)
(() => {
  const ptr = $('#ptr'); let y0 = null, dy = 0;
  const sheetOpen = () => !$('#evWrap').hidden;
  addEventListener('touchstart', (e) => { if (scrollY <= 0 && !refreshing && DATA && !sheetOpen() && (!$('#app').hidden || !$('#tlView').hidden || !$('#pcView').hidden)) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 === null) return; dy = e.touches[0].clientY - y0;
    if (dy <= 0 || scrollY > 0) { ptr.style.transform = ''; ptr.style.opacity = ''; return; }
    const d = Math.min(110, dy * 0.5); ptr.classList.add('pulling');
    ptr.style.transform = `translateY(${d - 60}px) rotate(${d * 3}deg)`; ptr.style.opacity = Math.min(1, d / 60);
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (y0 === null) return; y0 = null; ptr.classList.remove('pulling');
    if (dy * 0.5 > 70) {
      ptr.style.transform = 'translateY(10px)'; ptr.style.opacity = 1; ptr.classList.add('spin');
      checkForUpdate(); await refreshData(); ptr.classList.remove('spin');
    }
    ptr.style.transform = ''; ptr.style.opacity = '';
  });
})();

/* ---------------- app updates ----------------
 * The shell is cache-first, so a launch shows the cached version while the browser fetches the new sw.js; a phone that
 * only resumes the app from the background never navigates, so it never checks at all. Fix:
 *  - register with updateViaCache:'none' (sw.js never comes from the HTTP cache) and check for a new sw.js on start,
 *    whenever the app comes to the foreground, on refresh / pull-to-refresh, and every 30 minutes;
 *  - the new sw skipWaiting()s + clients.claim()s; when it takes over (controllerchange) the page reloads itself so the
 *    new code runs right away — unless a sheet is open or the PIN screen is up, then a small "Update ready" bar
 *    is shown and the reload happens on tap (or the next time the app is backgrounded). */
let swReg = null, reloading = false, updatePending = false;
const busy = () => !$('#evWrap').hidden || PinGate.isOpen();
function applyUpdate() { if (reloading) return; reloading = true; location.reload(); }
function checkForUpdate() { if (swReg) swReg.update().catch(() => {}); }
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  let hadController = !!navigator.serviceWorker.controller; // the very first install's claim needs no reload
  navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then((r) => { swReg = r; checkForUpdate(); }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    if (!busy()) return applyUpdate();
    updatePending = true; $('#updBar').hidden = false;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (updatePending) applyUpdate(); } else checkForUpdate(); });
  setInterval(checkForUpdate, 30 * 60e3);
  $('#updBtn').addEventListener('click', applyUpdate);
}
boot();
})();
