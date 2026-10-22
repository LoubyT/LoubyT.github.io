(() => {
  'use strict';

  const KEY = 'deals.v1';
  const TAB_KEY = 'deals.tab';
  const $ = (s) => document.querySelector(s);

  let deals = [];   // loaded at the bottom, once all helpers exist
  const Match = window.DealMatch || null;   // smart coupon -> Walmart product matcher (match.js)
  if (Match) Match.load();
  let store = 'walmart'; // Walmart is the primary store: always open on it
  let undoStack = null;
  let toastTimer = 0;

  const el = {
    total: $('#total'), sub: $('#sub'), tabs: $('#tabs'), list: $('#list'),
    empty: $('#empty'), emptyTitle: $('#emptyTitle'), clear: $('#clearChecked'),
    shopBtn: $('#shopBtn'), addBtn: $('#addBtn'), scrim: $('#scrim'),
    sheet: $('#sheet'), fName: $('#fName'), fAmount: $('#fAmount'), fStore: $('#fStore'),
    fLink: $('#fLink'), linkField: $('#linkField'), moreBtn: $('#moreBtn'), moreOpts: $('#moreOpts'),
    shopSheet: $('#shopSheet'), shopBody: $('#shopBody'),
    toast: $('#toast'), toastText: $('#toastText'), toastUndo: $('#toastUndo'),
    shotInput: $('#shotInput'), importSheet: $('#importSheet'), importBusy: $('#importBusy'),
    importBar: $('#importBar'), importStatus: $('#importStatus'), importReview: $('#importReview'),
    reviewTitle: $('#reviewTitle'), reviewList: $('#reviewList'), reviewAdd: $('#reviewAdd'), reviewCancel: $('#reviewCancel'),
  };

  /* ---------- data ---------- */
  function load() {
    let d;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch { return []; }
    return Array.isArray(d) ? d.filter((x) => x && typeof x === 'object').map(normalize) : [];
  }

  /* ---------- Ibotta quantity rules ----------
   * mustBuy N: buy at least N items to earn the cash back once.
   * limit L:   cash back can be earned up to L times.
   * qty steps by mustBuy, from mustBuy to mustBuy × limit.
   * cash back = amount × min(limit, floor(qty / mustBuy)). */
  const toInt = (v, def = 1) => { const n = parseInt(v, 10); return n >= 1 ? Math.min(n, 99) : def; };
  function rules(d) {
    const m = toInt(d.mustBuy), l = toInt(d.limit);
    return { m, l, min: m, max: m * l };
  }
  function clampQty(d, q) {
    const { m, min, max } = rules(d);
    q = Math.round(toInt(q, min) / m) * m;
    return Math.max(min, Math.min(max, q));
  }
  function cashBack(d) {
    const { m, l } = rules(d);
    const q = clampQty(d, d.qty);
    return (d.amount || 0) * Math.min(l, Math.floor(q / m));
  }
  const hasRange = (d) => rules(d).max > rules(d).min;
  function hint(d) {
    const { m, l, max } = rules(d);
    const parts = [];
    if (m > 1) parts.push(`Buy ${m}`);
    if (l > 1) parts.push(`${m > 1 ? 'up' : 'Up'} to ${max}`);
    return parts.join(', ');
  }
  /** Fill in rule fields for deals saved before quantities existed. */
  function normalize(d) {
    if (!d || typeof d !== 'object') return d;
    const notes = String(d.note || '').split(/\s*·\s*/).filter(Boolean);
    if (d.mustBuy == null) {
      const b = notes.map((n) => n.match(/^Buy (\d+)$/i)).find(Boolean);
      d.mustBuy = b ? +b[1] : 1;
    }
    d.note = notes.filter((n) => !/^Buy \d+$/i.test(n)).join(' · ');
    d.mustBuy = toInt(d.mustBuy);
    d.limit = toInt(d.limit);
    d.qty = clampQty(d, d.qty == null ? d.mustBuy : d.qty);
    return d;
  }

  const MINUS = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  /** Small − qty + control. */
  function stepper(val, min, max, label) {
    return `<span class="step" role="group" aria-label="${esc(label)}">
      <button type="button" class="step-btn" data-d="-1" aria-label="Fewer"${val <= min ? ' disabled' : ''}>${MINUS}</button>
      <span class="step-val" aria-live="polite">${val}</span>
      <button type="button" class="step-btn" data-d="1" aria-label="More"${val >= max ? ' disabled' : ''}>${PLUS}</button>
    </span>`;
  }
  const CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  /** Product photo (from screenshot import) or a soft letter tile; optional check badge. */
  function thumb(d, withCheck) {
    const ok = typeof d.img === 'string' && d.img.startsWith('data:image/');
    const letter = (String(d.name || '').match(/[A-Za-z0-9]/) || ['•'])[0].toUpperCase();
    return `<span class="thumb${ok ? '' : ' ph'}" aria-hidden="true">${ok ? `<img src="${d.img}" alt="">` : `<span class="ph-letter">${esc(letter)}</span>`}${withCheck ? `<span class="check">${CHECK_SVG}</span>` : ''}</span>`;
  }

  const CART_SVG = '<svg class="cart-ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="19.5" r="1.4" fill="currentColor"/><circle cx="17" cy="19.5" r="1.4" fill="currentColor"/></svg>';
  /** The exact Walmart product a deal is tied to (shown under the deal name). */
  const prodLine = (d) => d.store === 'walmart' && d.product && d.product.short
    ? `<span class="prod">${CART_SVG}<span>${esc(d.product.short)}</span></span>` : '';
  /** Starting quantity: what the family usually buys, kept inside the offer's min/max. */
  const startQty = (d, p) => clampQty(d, Math.max(rules(d).min, (p && p.typicalQty) || 1));

  function metaLine(d, withStepper) {
    const h = hint(d);
    const bits = [h, d.note].filter(Boolean).map(esc).join(' · ');
    if (withStepper && hasRange(d)) {
      const { min, max } = rules(d);
      return `<span class="meta">${stepper(clampQty(d, d.qty), min, max, 'Quantity')}${bits ? `<span class="meta-text">${bits}</span>` : ''}</span>`;
    }
    const qtyTxt = !withStepper && hasRange(d) ? `Qty ${clampQty(d, d.qty)}` : '';
    const all = [qtyTxt, bits].filter(Boolean).join(' · ');
    return all ? `<span class="note">${all}</span>` : '';
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(deals)); }
    catch {
      // Storage full: drop photos from checked-off deals first, then from all, and retry.
      deals.forEach((d) => { if (d.done) delete d.img; });
      try { localStorage.setItem(KEY, JSON.stringify(deals)); }
      catch { deals.forEach((d) => delete d.img); try { localStorage.setItem(KEY, JSON.stringify(deals)); } catch {} }
    }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const money = (n) => '$' + (Math.round(n * 100) / 100).toFixed(2);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Pull a Walmart item ID out of a pasted link (walmart.com/ip/<slug>/<id> or /ip/<id>). */
  function walmartId(text) {
    if (!text) return null;
    const m = String(text).match(/walmart\.com\/ip\/(?:[^\s\/?#]+\/)?(\d{5,})/i);
    return m ? m[1] : null;
  }
  function firstUrl(text) {
    const m = String(text || '').match(/https?:\/\/\S+/i);
    return m ? m[0] : '';
  }

  /* ---------- render ---------- */
  function updateStepper(stepEl, d) {
    if (!stepEl) return;
    const { min, max } = rules(d);
    const q = clampQty(d, d.qty);
    stepEl.querySelector('.step-val').textContent = q;
    stepEl.querySelector('[data-d="-1"]').disabled = q <= min;
    stepEl.querySelector('[data-d="1"]').disabled = q >= max;
  }

  function render() {
    renderHeader();
    const mine = deals.filter((d) => d.store === store);
    el.list.innerHTML = '';
    mine.filter((d) => !d.done).forEach((d) => el.list.appendChild(row(d)));
    mine.filter((d) => d.done).forEach((d) => el.list.appendChild(row(d)));
  }

  function renderHeader() {
    el.tabs.dataset.active = store;
    el.tabs.querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.store === store)));

    const mine = deals.filter((d) => d.store === store);
    const open = mine.filter((d) => !d.done);
    const done = mine.filter((d) => d.done);
    const expected = open.reduce((s, d) => s + cashBack(d), 0);
    const earned = done.reduce((s, d) => s + cashBack(d), 0);

    el.total.textContent = money(expected);
    const parts = [];
    if (!mine.length) parts.push('No deals yet');
    else parts.push(open.length ? `${open.length} deal${open.length === 1 ? '' : 's'} to grab` : 'All done 🎉');
    if (earned > 0) parts.push(`${money(earned)} earned`);
    el.sub.textContent = parts.join('  ·  ');

    el.empty.hidden = mine.length > 0;
    el.emptyTitle.textContent = store === 'heb' ? 'No H‑E‑B deals yet' : 'No Walmart deals yet';
    el.clear.hidden = done.length === 0;
    el.clear.textContent = `Clear checked (${done.length})`;
    el.shopBtn.hidden = store !== 'walmart' || open.length === 0;
  }

  function row(d) {
    const li = document.createElement('li');
    li.className = 'item' + (d.done ? ' done' : '');
    li.dataset.id = d.id;
    const linkIcon = d.store === 'walmart' && walmartId(d.link) && !d.product
      ? '<svg class="link-dot" viewBox="0 0 24 24" width="15" height="15" aria-label="Has Walmart link"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      : '';
    li.innerHTML = `
      <div class="item-del-bg" aria-hidden="true">Delete</div>
      <div class="item-row" role="button" tabindex="0" aria-pressed="${!!d.done}">
        ${thumb(d, true)}
        <span class="main"><span class="name">${esc(d.name)}${linkIcon}</span>${prodLine(d)}${metaLine(d, !d.done)}</span>
        ${d.amount ? `<span class="amt">${money(cashBack(d))}</span>` : ''}
        <button class="del" type="button" aria-label="Delete ${esc(d.name)}">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>`;
    attachGestures(li, d.id);
    return li;
  }

  /* ---------- actions ---------- */
  function toggle(id) {
    const d = deals.find((x) => x.id === id);
    if (!d) return;
    d.done = !d.done;
    d.doneAt = d.done ? Date.now() : null;
    if (navigator.vibrate) navigator.vibrate(8);
    save(); render();
  }

  function remove(id, li) {
    const idx = deals.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [gone] = deals.splice(idx, 1);
    save();
    const finish = () => render();
    if (li) { li.classList.add('removing'); setTimeout(finish, 200); } else finish();
    showToast(`Deleted “${gone.name}”`, () => { deals.splice(idx, 0, gone); save(); render(); });
  }

  function clearChecked() {
    const before = deals.slice();
    const n = deals.filter((d) => d.store === store && d.done).length;
    deals = deals.filter((d) => !(d.store === store && d.done));
    save(); render();
    showToast(`Cleared ${n} item${n === 1 ? '' : 's'}`, () => { deals = before; save(); render(); });
  }

  function showToast(text, undo) {
    undoStack = undo;
    el.toastText.textContent = text;
    el.toastUndo.hidden = !undo;
    el.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4500);
  }
  function hideToast() { el.toast.classList.remove('on'); undoStack = null; }
  el.toastUndo.addEventListener('click', () => { if (undoStack) undoStack(); hideToast(); });

  /* ---------- tap + swipe-to-delete ---------- */
  function attachGestures(li, id) {
    const rowEl = li.querySelector('.item-row');
    const del = li.querySelector('.del');
    let x0 = 0, y0 = 0, dx = 0, tracking = false, swiping = false;

    del.addEventListener('click', (e) => { e.stopPropagation(); remove(id, li); });
    li.querySelectorAll('.step-btn').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = deals.find((x) => x.id === id);
      if (!d) return;
      d.qty = clampQty(d, d.qty + (+b.dataset.d) * rules(d).m);
      save();
      updateStepper(li.querySelector('.step'), d);
      const amt = li.querySelector('.amt');
      if (amt) amt.textContent = money(cashBack(d));
      renderHeader();
    }));
    rowEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); } });

    rowEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.del, .step')) return;
      tracking = true; swiping = false; dx = 0; x0 = e.clientX; y0 = e.clientY;
    });
    rowEl.addEventListener('pointermove', (e) => {
      if (!tracking) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!swiping && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.3) {
        swiping = true; li.classList.add('swiping'); rowEl.setPointerCapture(e.pointerId); rowEl.style.transition = 'none';
      }
      if (swiping) { dx = Math.min(0, mx); rowEl.style.transform = `translateX(${dx}px)`; }
    });
    const end = (e) => {
      if (!tracking) return;
      tracking = false;
      if (swiping) {
        rowEl.style.transition = '';
        if (dx < -110) { rowEl.style.transform = 'translateX(-110%)'; remove(id, li); }
        else { rowEl.style.transform = ''; setTimeout(() => li.classList.remove('swiping'), 250); }
      } else if (e.type === 'pointerup' && !e.target.closest('.del, .step')) {
        toggle(id);
      }
    };
    rowEl.addEventListener('pointerup', end);
    rowEl.addEventListener('pointercancel', end);
  }

  /* ---------- tabs ---------- */
  el.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b || b.dataset.store === store) return;
    store = b.dataset.store;
    localStorage.setItem(TAB_KEY, store);
    render();
  });

  /* ---------- add sheet ---------- */
  let formStore = store;
  function setFormStore(s) {
    formStore = s;
    el.fStore.dataset.active = s;
    el.fStore.querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.store === s)));
    el.linkField.hidden = s !== 'walmart';
  }
  el.fStore.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (b) setFormStore(b.dataset.store);
  });

  function openSheet(sheet) {
    closeSheets();
    el.scrim.classList.add('on');
    sheet.classList.add('on');
    sheet.setAttribute('aria-hidden', 'false');
  }
  function closeSheets() {
    el.scrim.classList.remove('on');
    [el.sheet, el.shopSheet, el.importSheet].forEach((s) => { s.classList.remove('on'); s.setAttribute('aria-hidden', 'true'); });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  const form = { mustBuy: 1, limit: 1 };
  const FORM_MAX = { mustBuy: 10, limit: 20 };
  function renderFormSteps() {
    el.sheet.querySelectorAll('.opt-step').forEach((w) => {
      const k = w.dataset.k;
      w.innerHTML = stepper(form[k], 1, FORM_MAX[k], k === 'mustBuy' ? 'Must buy' : 'Limit');
    });
  }
  el.moreBtn.addEventListener('click', () => {
    const open = el.moreOpts.hidden;
    el.moreOpts.hidden = !open;
    el.moreBtn.setAttribute('aria-expanded', String(open));
  });
  el.moreOpts.addEventListener('click', (e) => {
    const b = e.target.closest('.step-btn');
    if (!b || b.disabled) return;
    const k = b.closest('.opt-step').dataset.k;
    form[k] = Math.max(1, Math.min(FORM_MAX[k], form[k] + (+b.dataset.d)));
    renderFormSteps();
  });

  function openAdd() {
    el.sheet.reset();
    form.mustBuy = 1; form.limit = 1; renderFormSteps();
    el.moreOpts.hidden = true; el.moreBtn.setAttribute('aria-expanded', 'false');
    el.sheet.querySelectorAll('.field').forEach((f) => f.classList.remove('bad'));
    setFormStore(store);
    openSheet(el.sheet);
    // Focus synchronously so iOS opens the keyboard from the tap.
    el.fName.focus({ preventScroll: true });
  }
  el.addBtn.addEventListener('click', openAdd);
  el.scrim.addEventListener('click', () => { if (!importing) closeSheets(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });

  el.fName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.fAmount.focus(); } });
  el.fAmount.addEventListener('input', () => {
    el.fAmount.value = el.fAmount.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  });

  el.sheet.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el.fName.value.trim().replace(/\s+/g, ' ');
    if (!name) {
      el.fName.closest('.field').classList.add('bad');
      el.fName.focus();
      return;
    }
    const amount = parseFloat(el.fAmount.value) || 0;
    let link = formStore === 'walmart' ? firstUrl(el.fLink.value) || el.fLink.value.trim() : '';
    let product = null;
    // No link pasted: tie it to the product they usually buy, when the matcher is sure.
    if (formStore === 'walmart' && !walmartId(link) && Match) {
      const m = Match.match({ name });
      if (m.auto && m.product) { product = m.product; link = product.url; }
    }
    const nd = { id: uid(), name, amount: Math.round(amount * 100) / 100, store: formStore, link,
      mustBuy: form.mustBuy, limit: form.limit, qty: form.mustBuy, done: false, createdAt: Date.now() };
    if (product) { nd.product = slimProduct(product); nd.qty = startQty(nd, product); }
    deals.unshift(normalize(nd));
    save();
    if (store !== formStore) { store = formStore; localStorage.setItem(TAB_KEY, store); }
    closeSheets();
    render();
  });
  el.fName.addEventListener('input', () => el.fName.closest('.field').classList.remove('bad'));

  /* ---------- Shop at Walmart ---------- */
  const cartUrl = (items) => 'https://affil.walmart.com/cart/addToCart?items=' + items.map(([id, q]) => `${id}|${q}`).join(',');
  const searchUrl = (q) => 'https://www.walmart.com/search?q=' + encodeURIComponent(q);
  const go = (url) => { window.open(url, '_blank', 'noopener'); };

  el.shopBtn.addEventListener('click', () => {
    const open = deals.filter((d) => d.store === 'walmart' && !d.done);
    const qtyById = new Map();
    open.forEach((d) => { const id = walmartId(d.link); if (id) qtyById.set(id, (qtyById.get(id) || 0) + clampQty(d, d.qty)); });
    const ids = [...qtyById.entries()];
    const unlinked = open.filter((d) => !walmartId(d.link));

    if (!open.length) return go('https://www.walmart.com/');
    if (!unlinked.length) return go(cartUrl(ids));
    if (!ids.length && unlinked.length === 1) return go(searchUrl([unlinked[0].name, unlinked[0].note].filter(Boolean).join(' ')));

    let html = '';
    if (ids.length) {
      html += `<button class="primary" data-url="${esc(cartUrl(ids))}">Add ${ids.length} item${ids.length === 1 ? '' : 's'} to cart</button>`;
      html += `<p class="shop-note" style="margin-top:18px">Find the rest:</p>`;
    } else {
      html += `<p class="shop-note">Tap an item to find it at Walmart.</p>`;
    }
    html += unlinked.map((d) => `<button class="secondary" data-url="${esc(searchUrl([d.name, d.note].filter(Boolean).join(' ')))}"><span>${esc(d.name)}</span><span>Find ›</span></button>`).join('');
    el.shopBody.innerHTML = html;
    openSheet(el.shopSheet);
  });
  el.shopBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-url]');
    if (b) go(b.dataset.url);
  });

  el.clear.addEventListener('click', clearChecked);

  /* ---------- Add from screenshots (on-device OCR, lazy-loaded) ---------- */
  const STORE_NAME = { walmart: 'Walmart', heb: 'H‑E‑B' };
  let review = [];
  let importing = false;

  function loadImporter() {
    if (window.DealImport) return Promise.resolve();
    return new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'import.js'; sc.onload = res; sc.onerror = () => rej(new Error('load'));
      document.head.appendChild(sc);
    });
  }

  el.shotInput.addEventListener('change', async () => {
    const files = [...el.shotInput.files].filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|heic|webp)$/i.test(f.name));
    el.shotInput.value = '';
    if (!files.length || importing) return;
    importing = true;
    el.importBusy.hidden = false; el.importReview.hidden = true;
    el.importBar.style.width = '3%';
    el.importStatus.textContent = 'Getting ready…';
    openSheet(el.importSheet);

    const results = [];
    try {
      await loadImporter();
      const slow = setTimeout(() => { el.importStatus.textContent = 'Getting ready… the first time takes a few seconds'; }, 2500);
      await window.DealImport.warm();
      clearTimeout(slow);
      for (let i = 0; i < files.length; i++) {
        const label = files.length > 1 ? `Screenshot ${i + 1} of ${files.length}` : 'Reading screenshot';
        el.importStatus.textContent = label;
        const setP = (p) => { el.importBar.style.width = `${Math.max(3, ((i + p) / files.length) * 100)}%`; };
        setP(0);
        try { results.push(await window.DealImport.read(files[i], setP)); }
        catch { results.push(null); }
        setP(1);
      }
    } catch {
      results.length = 0;
      files.forEach(() => results.push(null));
    }
    window.DealImport && window.DealImport.done();   // free memory on the phone
    importing = false;
    showReview(results);
  });

  const slimProduct = (p) => p && { id: String(p.id), short: p.short || p.name, url: p.url || `https://www.walmart.com/ip/${p.id}` };

  /** Run the matcher for one review item: auto-fill when sure, otherwise offer a one-tap picker. */
  async function matchReview(r) {
    r.match = null; r.product = null; r.picking = false;
    if (!Match) return;
    await Match.load();
    const m = await Match.matchSmart(r.coupon);
    r.match = m;
    if (m.auto && m.product) { r.product = m.product; r.qty = startQty(r, m.product); }
    else if (m.remembered && !m.product) r.searchPicked = true;   // she chose "search Walmart" before
    else r.picking = m.candidates.length > 0;
  }

  async function showReview(results) {
    const existing = new Set(deals.filter((d) => !d.done).map((d) => d.store + '|' + d.name.toLowerCase()));
    review = results.map((r, i) => {
      if (!r || !r.confident) return { fail: true, n: i + 1, name: r && r.name, amount: r && r.amount };
      const dupe = existing.has(r.store + '|' + r.name.toLowerCase());
      return normalize({ on: !dupe, dupe, name: r.name, amount: r.amount, note: r.note, store: r.store, img: r.img || '',
        mustBuy: r.mustBuy, limit: r.limit, qty: r.mustBuy, coupon: { name: r.name, note: r.note || '', details: r.details || '' } });
    });
    el.importStatus.textContent = 'Matching your usual products…';
    await Promise.all(review.filter((r) => !r.fail).map(matchReview));
    el.importBusy.hidden = true; el.importReview.hidden = false;
    renderReview();
  }

  function renderReview() {
    const ok = review.filter((r) => !r.fail);
    el.reviewTitle.textContent = ok.length
      ? `Found ${ok.length} deal${ok.length === 1 ? '' : 's'}`
      : 'Couldn’t read those';
    el.reviewList.innerHTML = review.map(rvItem).join('');
    el.reviewList.querySelectorAll('.rv-name').forEach(grow);
    updateAddBtn();
  }

  /** Walmart product row on a review card: matched product, one-tap picker, or "search" note. */
  function prodBlock(r) {
    if (r.store !== 'walmart') return '';
    const cands = (r.match && r.match.candidates) || [];
    if (r.picking && cands.length) {
      return `<div class="rv-pick">
          <p class="rv-pick-q">Which one do you get?</p>
          ${cands.map((c, k) => `<button type="button" class="pick" data-p="${k}"><span>${esc(c.product.short)}</span>${c.product.trips ? `<em>${c.product.trips}×</em>` : ''}</button>`).join('')}
          <button type="button" class="pick pick-search">Search Walmart instead</button>
        </div>`;
    }
    if (r.product) {
      return `<button type="button" class="rv-prod">${CART_SVG}<span class="rv-prod-name">${esc(r.product.short)}</span>${cands.length ? '<span class="rv-prod-chg">Change</span>' : ''}</button>`;
    }
    const again = cands.length ? '<span class="rv-prod-chg">Pick</span>' : '';
    return `<button type="button" class="rv-prod none"${cands.length ? '' : ' disabled'}>${CART_SVG}<span class="rv-prod-name">Will search Walmart</span>${again}</button>`;
  }

  function rvItem(r, i) {
    return r.fail
      ? `<li class="rv fail">Couldn’t read screenshot ${r.n}. You can type it in instead.</li>`
      : `<li class="rv${r.on ? ' on' : ''}" data-i="${i}">
          <span class="check" role="checkbox" aria-checked="${r.on}" tabindex="0"><svg viewBox="0 0 24 24" width="16" height="16"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          ${thumb(r, false)}
          <div class="rv-body">
            <textarea class="rv-name" rows="1" aria-label="Item name" maxlength="80" enterkeyhint="done">${esc(r.name)}</textarea>
            <div class="rv-meta">
              <label class="rv-amt">$<input inputmode="decimal" value="${r.amount.toFixed(2)}" aria-label="Cash back each time" maxlength="6"></label>
              <button type="button" class="chip">${STORE_NAME[r.store]}</button>
            </div>
            ${prodBlock(r)}
            <div class="rv-rules">${metaLine(r, true)}<span class="rv-total"${hasRange(r) ? '' : ' hidden'}>${money(cashBack(r))} back</span></div>
            ${r.dupe ? '<div class="rv-warn">Already on your list</div>' : ''}
          </div>
        </li>`;
  }
  function rerenderItem(li, i) {
    const tmp = document.createElement('div');
    tmp.innerHTML = rvItem(review[i], i).trim();
    const n = tmp.firstElementChild;
    li.replaceWith(n);
    grow(n.querySelector('.rv-name'));
  }

  function grow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

  function updateAddBtn() {
    const n = review.filter((r) => !r.fail && r.on && r.name.trim()).length;
    el.reviewAdd.textContent = n ? `Add ${n} deal${n === 1 ? '' : 's'}` : 'Add deals';
    el.reviewAdd.disabled = !n;
    el.reviewAdd.style.opacity = n ? '' : '.4';
  }

  el.reviewList.addEventListener('click', (e) => {
    const li = e.target.closest('.rv[data-i]');
    if (!li) return;
    const r = review[+li.dataset.i];
    const sb = e.target.closest('.step-btn');
    if (sb) {
      r.qty = clampQty(r, r.qty + (+sb.dataset.d) * rules(r).m);
      updateStepper(li.querySelector('.step'), r);
      li.querySelector('.rv-total').textContent = `${money(cashBack(r))} back`;
      return;
    }
    const pk = e.target.closest('.pick');
    if (pk) {
      const cands = (r.match && r.match.candidates) || [];
      if (pk.classList.contains('pick-search')) { r.product = null; r.searchPicked = true; }
      else { const c = cands[+pk.dataset.p]; r.product = c.product; r.qty = startQty(r, c.product); r.searchPicked = false; }
      r.picked = true; r.picking = false;
      if (navigator.vibrate) navigator.vibrate(8);
      return rerenderItem(li, +li.dataset.i);
    }
    if (e.target.closest('.rv-prod')) {
      if ((r.match && r.match.candidates.length)) { r.picking = true; rerenderItem(li, +li.dataset.i); }
      return;
    }
    if (e.target.closest('.check')) {
      r.on = !r.on; li.classList.toggle('on', r.on);
      li.querySelector('.check').setAttribute('aria-checked', String(r.on));
      updateAddBtn();
    } else if (e.target.closest('.chip')) {
      r.store = r.store === 'walmart' ? 'heb' : 'walmart';
      rerenderItem(li, +li.dataset.i);
    }
  });
  el.reviewList.addEventListener('input', (e) => {
    const li = e.target.closest('.rv[data-i]');
    if (!li) return;
    const r = review[+li.dataset.i];
    if (e.target.classList.contains('rv-name')) { r.name = e.target.value.replace(/\n/g, ' '); e.target.value = r.name; grow(e.target); }
    else {
      e.target.value = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
      r.amount = parseFloat(e.target.value) || 0;
      li.querySelector('.rv-total').textContent = `${money(cashBack(r))} back`;
    }
    updateAddBtn();
  });

  el.reviewList.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('rv-name')) return;
    const li = e.target.closest('.rv[data-i]');
    const i = +li.dataset.i, r = review[i];
    if (r.picked || !r.name.trim() || r.name === r.coupon.name) return;
    r.coupon = Object.assign({}, r.coupon, { name: r.name.trim() });
    await matchReview(r);
    const cur = el.reviewList.querySelector(`.rv[data-i="${i}"]`);
    if (cur) rerenderItem(cur, i);
  });

  el.reviewAdd.addEventListener('click', () => {
    const add = review.filter((r) => !r.fail && r.on && r.name.trim());
    if (!add.length) return;
    const now = Date.now();
    add.slice().reverse().forEach((r, k) => {
      const prod = r.store === 'walmart' && r.product ? slimProduct(r.product) : null;
      // Remember what she picked by hand so the same offer matches instantly next time.
      if (Match && r.store === 'walmart' && r.picked) Match.remember(r.coupon, r.searchPicked ? null : r.product);
      const d = {
        id: uid(), name: r.name.trim().replace(/\s+/g, ' '), amount: Math.round((r.amount || 0) * 100) / 100,
        note: r.note || '', store: r.store, link: prod ? prod.url : '', mustBuy: r.mustBuy, limit: r.limit, qty: r.qty, img: r.img || '',
        done: false, createdAt: now + k,
      };
      if (prod) d.product = prod;
      deals.unshift(normalize(d));
    });
    save();
    if (!add.some((r) => r.store === store)) store = add[0].store;
    review = [];
    closeSheets();
    render();
    showToast(`Added ${add.length} deal${add.length === 1 ? '' : 's'}`, null);
  });
  el.reviewCancel.addEventListener('click', () => { review = []; closeSheets(); });

  deals = load();
  save();   // persist migrated fields
  render();
  window.__dealRules = { rules, clampQty, cashBack, normalize, hint };
  window.__dealDebug = { get review() { return review; } };

  // the service worker is registered by savings-boot.js (before the PIN screen), so updates arrive even while locked
})();
