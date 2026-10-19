/* Family Dashboard — vanilla JS, no network calls except same-origin data files. */
'use strict';
(() => {
const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
const DATA_AAD = enc.encode('family-dashboard:data:v1');
const WRAP_AAD = enc.encode('family-dashboard:wrap:v1');
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Must match tools/set-passcode.html exactly. Case/extra spaces don't matter (easier on phones).
const normPass = (p) => p.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/* ---------------- key storage (IndexedDB, non-extractable CryptoKey) ---------------- */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('family-dashboard', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('keys');
      r.onsuccess = () => res((this.db = r.result));
      r.onerror = () => rej(r.error);
    });
  },
  async op(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('keys', mode); const req = fn(tx.objectStore('keys'));
      tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
    });
  },
  get: (k) => IDB.op('readonly', (s) => s.get(k)),
  set: (k, v) => IDB.op('readwrite', (s) => s.put(v, k)),
  del: (k) => IDB.op('readwrite', (s) => s.delete(k)),
};

async function fetchJSON(url) {
  const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

async function unlockWithPasscode(pass) {
  const w = await fetchJSON('wrapped-key.json');
  const base = await crypto.subtle.importKey('raw', enc.encode(normPass(pass)), 'PBKDF2', false, ['deriveKey']);
  const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(w.salt), iterations: w.iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['unwrapKey']);
  // Throws if the passcode is wrong (GCM auth tag fails). Result is NON-extractable.
  const dk = await crypto.subtle.unwrapKey('raw', b64(w.wrapped), kek, { name: 'AES-GCM', iv: b64(w.iv), additionalData: WRAP_AAD },
    { name: 'AES-GCM' }, false, ['decrypt']);
  await IDB.set('dk', { key: dk, kid: w.kid });
  return { key: dk, kid: w.kid };
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

/* ---------------- local spending (this device only) ---------------- */
const SPEND_KEY = 'fd:spend:v1';
const Spend = {
  all() { try { return JSON.parse(localStorage.getItem(SPEND_KEY)) || []; } catch { return []; } },
  save(list) { localStorage.setItem(SPEND_KEY, JSON.stringify(list)); },
  add(cat, amt) { const l = this.all(); l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cat, amt, ts: Date.now() }); this.save(l); },
  remove(id) { this.save(this.all().filter((e) => e.id !== id)); },
  between(cat, a, b) { return this.all().filter((e) => e.cat === cat && e.ts >= +a && e.ts < +b); },
  sum(cat, a, b) { return this.between(cat, a, b).reduce((s, e) => s + e.amt, 0); },
};

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
  plans.sort((a, b) => a.when - b.when);
  const soon = plans.filter((x) => x.days <= 120);
  $('#plansSec').hidden = !soon.length;
  $('#plans').innerHTML = soon.map((x) => {
    const range = x.end_date ? `${fmtD(x.when)}–${x.end.getMonth() === x.when.getMonth() ? x.end.getDate() : fmtD(x.end)}` : fmtD(x.when, { weekday: 'short', month: 'short', day: 'numeric' });
    const amt = x.budget != null ? (x.estimated ? '~' : '') + usdSmart(x.budget) + ' · ' : '';
    const cls = x.days <= 1 ? 'now' : x.days <= 5 ? 'soon' : '';
    const lbl = x.days === 0 ? (x.end_date ? 'Now' : 'Today') : x.days === 1 ? 'Tomorrow' : `${x.days} days`;
    return `<div class="row reveal"><div class="emoji">${esc(x.icon || '📅')}</div>
      <div class="grow"><div class="name">${esc(x.name)}</div><div class="sub">${amt}${range}</div></div><span class="pill ${cls}">${lbl}</span></div>`;
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

  /* bills */
  const bills = (d.bills || []).map((b) => {
    let when = b.due_day ? nextMonthly(b.due_day, t) : b.repeat === 'yearly' ? nextYearly(b.due_date, t) : parseD(b.due_date);
    return { ...b, when, days: daysBetween(t, when) };
  }).filter((b) => b.days >= 0 && b.days <= 45).sort((a, b) => a.days - b.days);
  $('#billsSec').hidden = !(d.bills || []).length;
  const showAll = render.allBills, shown = showAll ? bills : bills.slice(0, 5);
  $('#bills').innerHTML = shown.map((b) => {
    const cls = b.days <= 1 ? 'now' : b.days <= 5 ? 'soon' : '';
    const lbl = b.days === 0 ? 'Today' : b.days === 1 ? 'Tomorrow' : `${b.days} days`;
    const amt = b.amount == null ? 'Amount TBD' : usdSmart(b.amount);
    return `<div class="row reveal"><div class="emoji">${esc(b.icon || '🧾')}</div>
      <div class="grow"><div class="name">${esc(b.name)}${badges(b)}</div><div class="sub">${amt} · due ${fmtD(b.when)}${b.autopay ? ' · autopay' : ''}</div></div>
      <span class="pill ${cls}">${lbl}</span></div>`;
  }).join('') + (bills.length > 5 ? `<button class="more" data-more>${showAll ? 'Show fewer' : `Show all ${bills.length} bills`}</button>` : '') || '<div class="empty">No bills due in the next 45 days 🎉</div>';

  /* budget (current calendar month) */
  const mStart = new Date(t.getFullYear(), t.getMonth(), 1), mEnd = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  const wStart = new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay()), wEnd = new Date(wStart.getFullYear(), wStart.getMonth(), wStart.getDate() + 7);
  $('#monthName').textContent = fmtD(t, { month: 'long', year: 'numeric' });
  let totB = 0, totS = 0, hasPh = false;
  const catHtml = (d.categories || []).map((c) => {
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
    const spent = Spend.sum(c.id, mStart, mEnd);
    if (budget != null) { totB += budget; } else hasPh = true;
    totS += spent;
    const left = budget != null ? budget - spent : null;
    const frac = budget ? spent / budget : 0;
    const col = frac > 1 ? ['#ff5d6c', '#ff8a5d'] : frac > .8 ? ['#ffb84d', '#ff8a5d'] : ['#2ee6c5', '#4da3ff'];
    const per = c.period === 'week' ? '/week' : c.period === 'month' ? '/month' : '/paycheck';
    const meta = (c.amount != null ? usdSmart(c.amount) + per : 'Amount TBD') + (notYet ? ` · starts ${fmtD(s)}` : '');
    const pctTxt = budget == null ? '—' : budget === 0 ? '—' : Math.round(frac * 100) + '%';
    let week = '';
    if (c.period === 'week' && c.amount != null && !(s && s >= wEnd)) {
      const ws = Spend.sum(c.id, wStart, wEnd), wf = ws / c.amount;
      const wc = wf > 1 ? '#ff5d6c' : wf > .8 ? '#ffb84d' : '#2ee6c5';
      week = `<div class="week"><div class="wlbl"><span>This week</span><span><b>${usdSmart(ws)}</b> of ${usdSmart(c.amount)}</span></div>
        <div class="wbar"><i data-w="${Math.min(100, wf * 100)}" style="background:${wc}"></i></div></div>`;
    }
    const nums = budget == null ? `<span>Spent <b>${usdSmart(spent)}</b></span>`
      : `<span>Spent <b>${usdSmart(spent)}</b></span><span>${left < 0 ? `<b class="over">${usdSmart(-left)} over</b>` : `Left <b>${usdSmart(left)}</b>`}</span><span>of ${usd(budget)}</span>`;
    return `<article class="card cat reveal ${notYet && activeDays === 0 ? 'inactive' : ''}">
      ${ring(84, 9, frac, col, `<div class="pct">${pctTxt}<small>used</small></div>`)}
      <div class="info"><h3>${esc(c.icon ? c.icon + ' ' : '')}${esc(c.name)}${badges(c)}</h3><div class="meta">${meta}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}<div class="nums">${notYet && activeDays === 0 ? `<span>Starts ${fmtD(s, { month: 'long', day: 'numeric' })}</span>` : nums}</div></div>
      ${week}
      <button class="add" data-add="${esc(c.id)}">+ Add spending</button></article>`;
  }).join('');
  $('#cats').innerHTML = catHtml;
  const totLeft = totB - totS, tf = totB ? totS / totB : 0;
  $('#summary').innerHTML = `${ring(104, 11, tf, tf > 1 ? ['#ff5d6c', '#ff8a5d'] : ['#8b7bff', '#ff6fb5'], `<div class="pct">${totB ? Math.round(tf * 100) + '%' : '—'}<small>used</small></div>`)}
    <div><div class="lbl">Left this month</div><div class="big" data-money="${totLeft}">${usd(0)}</div>
    <div class="bar3"><div>Budget<b>${usd(totB)}</b></div><div>Spent<b>${usdSmart(totS)}</b></div></div>
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

/* ---------------- add-spend sheet ---------------- */
let sheetCat = null;
function openSheet(id) {
  const c = DATA.categories.find((x) => x.id === id); if (!c) return;
  sheetCat = c;
  $('#sheetTitle').textContent = (c.icon ? c.icon + ' ' : '') + c.name;
  $('#sheetSub').textContent = 'How much did you spend?';
  $('#amt').value = '';
  $('#chips').innerHTML = [5, 10, 20, 25, 50, 100].map((v) => `<button type="button" data-chip="${v}">$${v}</button>`).join('');
  renderEntries();
  $('#sheetWrap').hidden = false;
  setTimeout(() => $('#amt').focus(), 250);
}
function renderEntries() {
  const t = today0(), ms = new Date(t.getFullYear(), t.getMonth(), 1), me = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  const list = Spend.between(sheetCat.id, ms, me).sort((a, b) => b.ts - a.ts);
  $('#entries').innerHTML = list.length ? `<h4>This month on this phone</h4>` + list.map((e) =>
    `<div class="entry"><span><b>${usdSmart(e.amt)}</b> <span class="d">· ${fmtD(new Date(e.ts), { weekday: 'short', month: 'short', day: 'numeric' })}</span></span><button type="button" aria-label="Remove ${usdSmart(e.amt)}" data-del="${e.id}">✕</button></div>`).join('') : '';
}
function closeSheets() { $('#sheetWrap').hidden = true; $('#menuWrap').hidden = true; }
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2200); }

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-add],[data-close],[data-chip],[data-del],[data-more]'); if (!t) return;
  if ('more' in t.dataset) { render.allBills = !render.allBills; refreshView(); }
  else if (t.dataset.add) openSheet(t.dataset.add);
  else if ('close' in t.dataset) closeSheets();
  else if (t.dataset.chip) { const cur = parseFloat($('#amt').value) || 0; $('#amt').value = String(Math.round((cur + +t.dataset.chip) * 100) / 100); }
  else if (t.dataset.del) { Spend.remove(t.dataset.del); renderEntries(); refreshView(); toast('Removed'); }
});
$('#spendForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = parseFloat(String($('#amt').value).replace(/[$,\s]/g, ''));
  if (!isFinite(v) || v <= 0 || v > 100000) { $('#amt').focus(); toast('Type an amount first'); return; }
  Spend.add(sheetCat.id, Math.round(v * 100) / 100);
  closeSheets(); refreshView(); toast(`Added ${usdSmart(v)} to ${sheetCat.name}`);
});
function refreshView() { const y = scrollY; render(); scrollTo(0, y); }

/* ---------------- boot / lock ---------------- */
function showLock(msg) { $('#app').hidden = true; $('#lock').hidden = false; if (msg) $('#lockSub').innerHTML = msg; }
function showApp() { $('#lock').hidden = true; $('#app').hidden = false; render(); }

async function boot() {
  let stored = null;
  try { stored = await IDB.get('dk'); } catch {}
  if (!stored) return showLock();
  try { DATA = await decryptData(stored); lastCheck = Date.now(); showApp(); }
  catch (e) {
    if (e.code === 'KID') { await IDB.del('dk'); return showLock('The passcode was changed.<br>Please type the new family passcode.'); }
    if (e.name === 'OperationError') { await IDB.del('dk'); return showLock(); }
    showLock('Can’t reach the dashboard right now.<br>Check your internet and try again.');
  }
}

$('#lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pass = $('#pass').value; if (!pass.trim()) return;
  const btn = $('#unlockBtn'); btn.disabled = true; btn.classList.add('busy'); btn.querySelector('span').textContent = 'Opening';
  $('#lockErr').textContent = '';
  try {
    const stored = await unlockWithPasscode(pass);
    DATA = await decryptData(stored);
    $('#pass').value = '';
    showApp();
  } catch (err) {
    const wrong = err && err.name === 'OperationError';
    $('#lockErr').textContent = wrong ? 'That passcode didn’t work. Try again.' : 'Couldn’t open it. Check your internet and try again.';
    const l = $('#lock'); l.classList.remove('shake'); void l.offsetWidth; l.classList.add('shake');
  } finally { btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('span').textContent = 'Open'; }
});
$('#showPass').addEventListener('click', () => { const p = $('#pass'); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#showPass').textContent = show ? 'Hide passcode' : 'Show passcode'; });
$('#menuBtn').addEventListener('click', () => { $('#menuWrap').hidden = false; });
/* ---------------- refresh: button, pull-to-refresh, foreground, timer ---------------- */
let refreshing = false, lastCheck = 0;
const sig = (d) => d ? (d.published_at || '') + '|' + (d.updated_at || '') : '';
async function refreshData({ silent = false } = {}) {
  if (refreshing || !DATA) return; refreshing = true; lastCheck = Date.now();
  const btn = $('#refreshTop'); btn.classList.add('spin');
  if (!silent) $('#app').classList.add('refreshing');
  try {
    const stored = await IDB.get('dk'); if (!stored) return showLock();
    const fresh = await decryptData(stored); // data.enc?t=<now>, cache:'no-store'; SW is network-first for it
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
    if (e.code === 'KID') { await IDB.del('dk'); DATA = null; return showLock('The passcode was changed.<br>Please type the new family passcode.'); }
    if (!silent) toast(navigator.onLine === false ? 'You’re offline — showing the last numbers' : 'Couldn’t refresh — try again in a bit');
  } finally { refreshing = false; btn.classList.remove('spin'); $('#app').classList.remove('refreshing'); }
}
$('#refreshTop').addEventListener('click', () => refreshData());
$('#refreshBtn').addEventListener('click', () => { closeSheets(); refreshData(); });
// back to the foreground -> check for new data (at most once a minute)
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 60e3) refreshData({ silent: true }); });
addEventListener('pageshow', (e) => { if (e.persisted) refreshData({ silent: true }); });
addEventListener('online', () => refreshData({ silent: true }));
// while open, re-check every 15 min (data is republished every ~2 h)
setInterval(() => { if (!document.hidden) refreshData({ silent: true }); }, 15 * 60e3);

// pull-to-refresh (touch devices)
(() => {
  const ptr = $('#ptr'); let y0 = null, dy = 0;
  const sheetOpen = () => !$('#sheetWrap').hidden || !$('#menuWrap').hidden;
  addEventListener('touchstart', (e) => { if (scrollY <= 0 && !refreshing && DATA && !sheetOpen() && !$('#app').hidden) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
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
      await refreshData(); ptr.classList.remove('spin');
    }
    ptr.style.transform = ''; ptr.style.opacity = '';
  });
})();
$('#forgetBtn').addEventListener('click', async () => { if (!confirm('Lock this phone? You’ll need the family passcode to open it again.')) return; closeSheets(); await IDB.del('dk'); DATA = null; showLock(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
boot();
})();
