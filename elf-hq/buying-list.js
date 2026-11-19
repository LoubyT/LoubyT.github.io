/* Buying list. Prices are integer cents. No catalog lives here.
 * Records stay in the private notebook and sync like the kids list.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfBuying = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BUDGET_CENTS = 82133;
  var FRIDAY_CENTS = 39599;
  var DECEMBER_CENTS = 42534;
  var TAX_BPS = 825;
  var TIMING = { bf: 'Buy Black Friday', later: 'BF or December' };

  function empty() { return { byId: {} }; }

  function validId(id) {
    return typeof id === 'string' && /^buy-[A-Za-z0-9_-]{4,40}$/.test(id);
  }

  function httpsUrl(url) {
    if (url == null || String(url).trim() === '') return '';
    var u;
    try { u = new URL(String(url)); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.href;
  }

  function centsField(value) {
    if (value == null || value === '') return { ok: true, cents: null };
    if (typeof value === 'number' && isFinite(value) && value >= 0 && Math.round(value) === value && value <= 100000000) {
      return { ok: true, cents: value };
    }
    var s = String(value).trim().replace(/^\$/, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false };
    var parts = s.split('.');
    var cents = Number(parts[0]) * 100;
    if (parts[1]) cents += Number((parts[1] + '00').slice(0, 2));
    if (cents > 100000000) return { ok: false };
    return { ok: true, cents: cents };
  }

  function clip(text, max) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!validId(raw.id)) return null;
    var title = clip(raw.title, 180);
    if (!title) return null;
    var url = httpsUrl(raw.url);
    if (url == null || !url) return null;
    var price = centsField(raw.priceCents != null && raw.price == null ? raw.priceCents : raw.price);
    if (!price.ok || price.cents == null) return null;
    var list = centsField(raw.listCents != null && raw.listPrice == null ? raw.listCents : raw.listPrice);
    if (!list.ok) return null;
    var coupon = centsField(raw.couponCents != null ? raw.couponCents : 0);
    if (!coupon.ok || coupon.cents == null) coupon = { cents: 0 };
    if (coupon.cents > price.cents) coupon.cents = price.cents;
    var timing = raw.timing === 'bf' ? 'bf' : 'later';
    var order = Number(raw.order);
    if (!isFinite(order)) order = 0;
    return {
      id: raw.id,
      order: Math.round(order),
      title: title,
      priceCents: price.cents,
      listCents: list.cents,
      deal: clip(raw.deal, 80),
      couponCents: coupon.cents,
      variant: clip(raw.variant, 80),
      url: url,
      note: clip(raw.note, 140),
      timing: timing,
      bought: !!raw.bought,
      removed: !!raw.removed
    };
  }

  function bookOf(book) {
    var next = empty();
    var src = book && book.byId && typeof book.byId === 'object' ? book.byId : {};
    Object.keys(src).forEach(function (id) {
      var item = normalize(src[id]);
      if (item) next.byId[item.id] = item;
    });
    return next;
  }

  function list(book) {
    var clean = bookOf(book);
    return Object.keys(clean.byId).map(function (id) { return clean.byId[id]; }).sort(function (a, b) {
      var rank = (a.timing === 'bf' ? 0 : 1) - (b.timing === 'bf' ? 0 : 1);
      return rank || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  }

  function get(book, id) {
    var clean = bookOf(book);
    return clean.byId[id] || null;
  }

  function ensureAll(book, raws) {
    var next = bookOf(book);
    var added = [];
    (raws || []).forEach(function (raw) {
      var item = normalize(raw);
      if (!item || next.byId[item.id]) return;
      next.byId[item.id] = item;
      added.push(JSON.parse(JSON.stringify(item)));
    });
    return { book: next, added: added };
  }

  function save(book, raw) {
    var next = bookOf(book);
    var item = normalize(raw);
    if (!item) return { ok: false, code: 'invalid', book: next };
    next.byId[item.id] = item;
    return { ok: true, book: next, item: JSON.parse(JSON.stringify(item)) };
  }

  function patch(book, id, fields) {
    var next = bookOf(book);
    var item = next.byId[id];
    if (!item) return { ok: false, code: 'missing', book: next };
    Object.keys(fields || {}).forEach(function (key) { item[key] = fields[key]; });
    var clean = normalize(item);
    if (!clean) return { ok: false, code: 'invalid', book: bookOf(book) };
    next.byId[id] = clean;
    return { ok: true, book: next, item: JSON.parse(JSON.stringify(clean)) };
  }

  function effectiveCents(item) {
    if (!item || item.removed || item.bought) return 0;
    var price = item.priceCents || 0;
    var coupon = item.couponCents || 0;
    return price > coupon ? price - coupon : 0;
  }

  function taxCents(pre) {
    return Math.round((pre || 0) * TAX_BPS / 10000);
  }

  function totals(items) {
    var pre = 0;
    var kept = 0;
    (items || []).forEach(function (item) {
      if (!item || item.removed || item.bought) return;
      pre += effectiveCents(item);
      kept += 1;
    });
    var tax = taxCents(pre);
    var withTax = pre + tax;
    return {
      preCents: pre,
      taxCents: tax,
      withTaxCents: withTax,
      budgetCents: BUDGET_CENTS,
      fridayCents: FRIDAY_CENTS,
      decemberCents: DECEMBER_CENTS,
      leftCents: BUDGET_CENTS - pre,
      leftAfterTaxCents: BUDGET_CENTS - withTax,
      under: pre <= BUDGET_CENTS,
      underAfterTax: withTax <= BUDGET_CENTS,
      kept: kept
    };
  }

  function money(cents) {
    var n = Math.abs(Math.round(cents || 0));
    var dollars = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var frac = n % 100;
    return (cents < 0 ? '-' : '') + '$' + dollars + '.' + (frac < 10 ? '0' : '') + frac;
  }

  function priceLabel(item) {
    if (!item) return '';
    var pay = (item.priceCents || 0) - (item.couponCents || 0);
    if (pay < 0) pay = 0;
    return money(pay);
  }

  function timingLabel(timing) {
    return TIMING[timing] || TIMING.later;
  }

  return {
    BUDGET_CENTS: BUDGET_CENTS,
    FRIDAY_CENTS: FRIDAY_CENTS,
    DECEMBER_CENTS: DECEMBER_CENTS,
    TAX_BPS: TAX_BPS,
    empty: empty,
    validId: validId,
    normalize: normalize,
    bookOf: bookOf,
    list: list,
    get: get,
    ensureAll: ensureAll,
    save: save,
    patch: patch,
    effectiveCents: effectiveCents,
    taxCents: taxCents,
    totals: totals,
    money: money,
    priceLabel: priceLabel,
    timingLabel: timingLabel
  };
});
