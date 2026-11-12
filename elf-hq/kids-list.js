/* Kids list trim-down. Prices are integer cents. A missing price counts as zero.
 * Item records live in the private notebook and sync like other gifts.
 * This file has no catalog.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfKids = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PEOPLE = ['Zelda', 'Leo', 'Unsorted'];
  var BUDGET_CENTS = 82100;

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function empty() { return { byId: {} }; }

  function validId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(id);
  }

  function httpsUrl(url) {
    if (url == null || String(url).trim() === '') return '';
    var u;
    try { u = new URL(String(url)); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.href;
  }

  function imageUrl(url) {
    var href = httpsUrl(url);
    if (href == null) return null;
    if (!href) return '';
    var host;
    try { host = new URL(href).host; } catch (e) { return null; }
    if (host !== 'm.media-amazon.com') return '';
    return href;
  }

  function dollarsToCents(price) {
    if (price == null || price === '') return { ok: true, cents: null };
    var s = String(price).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false };
    var parts = s.split('.');
    var cents = Number(parts[0]) * 100;
    if (parts[1]) cents += Number((parts[1] + '00').slice(0, 2));
    if (cents > 100000000) return { ok: false };
    return { ok: true, cents: cents };
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!validId(raw.id)) return null;
    if (PEOPLE.indexOf(raw.person) < 0) return null;
    var title = String(raw.title == null ? '' : raw.title).replace(/\s+/g, ' ').trim();
    if (!title || title.length > 300) return null;
    var url = httpsUrl(raw.url);
    if (url == null || !url) return null;
    var image = imageUrl(raw.image);
    if (image == null) return null;
    var price;
    if (raw.priceCents != null && raw.price == null) {
      var n = Number(raw.priceCents);
      if (!isFinite(n) || n < 0 || Math.round(n) !== n || n > 100000000) return null;
      price = n;
    } else {
      var parsed = dollarsToCents(raw.price);
      if (!parsed.ok) return null;
      price = parsed.cents;
    }
    var order = Number(raw.order);
    if (!isFinite(order)) order = 0;
    var locked = !!raw.locked;
    return {
      id: raw.id,
      order: Math.round(order),
      title: title,
      priceCents: price,
      url: url,
      image: image,
      person: raw.person,
      locked: locked,
      removed: locked ? false : !!raw.removed
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
      return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  }

  function get(book, id) {
    var clean = bookOf(book);
    return clean.byId[id] || null;
  }

  function save(book, raw) {
    var next = bookOf(book);
    var item = normalize(raw);
    if (!item) return { ok: false, code: 'invalid', book: next };
    next.byId[item.id] = item;
    return { ok: true, book: next, item: clone(item) };
  }

  function ensureAll(book, raws) {
    var next = bookOf(book);
    var added = [];
    (raws || []).forEach(function (raw) {
      var item = normalize(raw);
      if (!item || next.byId[item.id]) return;
      next.byId[item.id] = item;
      added.push(clone(item));
    });
    return { book: next, added: added };
  }

  function remove(book, id) {
    var next = bookOf(book);
    var item = next.byId[id];
    if (!item) return { ok: false, code: 'missing', book: next };
    if (item.locked) return { ok: false, code: 'locked', book: next };
    item.removed = true;
    return { ok: true, book: next, item: clone(item) };
  }

  function restore(book, id) {
    var next = bookOf(book);
    var item = next.byId[id];
    if (!item) return { ok: false, code: 'missing', book: next };
    item.removed = false;
    return { ok: true, book: next, item: clone(item) };
  }

  function restoreAll(book) {
    var next = bookOf(book);
    var items = [];
    Object.keys(next.byId).forEach(function (id) {
      if (!next.byId[id].removed) return;
      next.byId[id].removed = false;
      items.push(clone(next.byId[id]));
    });
    return { ok: true, book: next, items: items };
  }

  function assign(book, id, person) {
    if (PEOPLE.indexOf(person) < 0) return { ok: false, code: 'person', book: bookOf(book) };
    var next = bookOf(book);
    var item = next.byId[id];
    if (!item) return { ok: false, code: 'missing', book: next };
    if (item.person === person) return { ok: true, book: next, item: clone(item), changed: false };
    item.person = person;
    return { ok: true, book: next, item: clone(item), changed: true };
  }

  function amount(item) {
    if (!item || item.removed || item.priceCents == null) return 0;
    return item.priceCents;
  }

  function totals(items, budgetCents) {
    var people = { Zelda: 0, Leo: 0, Unsorted: 0 };
    var total = 0;
    var removed = 0;
    (items || []).forEach(function (item) {
      if (!item) return;
      if (item.removed) { removed += 1; return; }
      var cents = amount(item);
      total += cents;
      if (people[item.person] != null) people[item.person] += cents;
    });
    var budget = budgetCents == null ? BUDGET_CENTS : budgetCents;
    return {
      totalCents: total,
      budgetCents: budget,
      under: total <= budget,
      deltaCents: Math.abs(budget - total),
      people: people,
      removed: removed,
      kept: (items || []).length - removed
    };
  }

  function money(cents) {
    var n = Math.abs(Math.round(cents || 0));
    var dollars = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var frac = n % 100;
    return (cents < 0 ? '-' : '') + '$' + dollars + '.' + (frac < 10 ? '0' : '') + frac;
  }

  function priceLabel(item) {
    if (!item || item.priceCents == null) return 'price n/a';
    return money(item.priceCents);
  }

  return {
    PEOPLE: PEOPLE,
    BUDGET_CENTS: BUDGET_CENTS,
    empty: empty,
    validId: validId,
    normalize: normalize,
    bookOf: bookOf,
    list: list,
    get: get,
    save: save,
    ensureAll: ensureAll,
    remove: remove,
    restore: restore,
    restoreAll: restoreAll,
    assign: assign,
    totals: totals,
    money: money,
    priceLabel: priceLabel
  };
});
