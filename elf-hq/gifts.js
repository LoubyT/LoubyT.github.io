/* Gift totals and price observations.
 * Prices are integer cents. An unknown price is absent, never zero.
 * A price run may update an offer only. It cannot change the gift or what was paid.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfGifts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function dollarsToCents(text) {
    var s = String(text == null ? '' : text).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, code: 'cents' };
    var parts = s.split('.');
    var cents = Number(parts[0]) * 100;
    if (parts[1]) cents += Number(parts[1].length === 1 ? parts[1] + '0' : parts[1]);
    return { ok: true, cents: cents };
  }

  function retailLink(url) {
    if (url == null || String(url).trim() === '') return { ok: true, href: '' };
    var u;
    try { u = new URL(String(url)); } catch (e) { return { ok: false, code: 'url' }; }
    if (u.protocol !== 'https:') return { ok: false, code: 'https' };
    if (u.username || u.password) return { ok: false, code: 'url' };
    return { ok: true, href: u.href };
  }

  function blankGift(id, recipientId) {
    return {
      id: id,
      recipientId: recipientId,
      idea: '',
      url: '',
      variant: { size: '', color: '', model: '', pack: '' },
      quantity: 1,
      notes: '',
      priority: 'normal',
      status: 'idea',
      purchasedAt: null,
      spentCents: null,
      spentConfirmed: false,
      productRevision: 1,
      allowOtherCondition: false,
      offer: null,
      history: [],
      deleted: false
    };
  }

  function exactEnough(gift) {
    if (!gift || gift.deleted) return false;
    var link = retailLink(gift.url);
    if (!link.ok || !link.href) return false;
    var v = gift.variant || {};
    return !!(v.size || v.color || v.model || v.pack);
  }

  function compareLabel(gift) {
    return exactEnough(gift) ? '' : 'Choose exact item to compare';
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function applyObservation(gift, obs) {
    var next = clone(gift);
    var spent = next.spentCents;
    var confirmed = next.spentConfirmed;
    var status = next.status;
    var idea = next.idea;
    if (!obs || obs.productRevision !== next.productRevision) {
      return { ok: false, code: 'revision', gift: gift };
    }
    if (!(obs.amountCents > 0) || obs.amountCents !== Math.round(obs.amountCents)) {
      return { ok: false, code: 'no-price', gift: markStale(gift).gift };
    }
    if (obs.basis !== 'exact-variant') return { ok: false, code: 'basis', gift: gift };
    if (obs.condition && obs.condition !== 'new' && !next.allowOtherCondition) {
      return { ok: false, code: 'condition', gift: markStale(gift).gift };
    }
    if (obs.availability === 'out-of-stock') return { ok: false, code: 'stock', gift: markStale(gift).gift };
    if (obs.shady || obs.marketplaceUnverified) return { ok: false, code: 'seller', gift: markStale(gift).gift };
    if (!(obs.sellerCount > 0)) return { ok: false, code: 'sellers', gift: gift };
    var link = retailLink(obs.sourceUrl);
    if (!link.ok || !link.href) return { ok: false, code: 'url', gift: gift };
    var prior = next.offer && next.offer.basis === 'exact-variant' && next.offer.productRevision === next.productRevision
      ? next.offer.amountCents : null;
    var change = prior ? priceChange(prior, obs.amountCents) : null;
    var entry = {
      amountCents: obs.amountCents,
      sellerCount: obs.sellerCount,
      checkedAt: obs.checkedAt,
      sourceUrl: link.href,
      basis: 'exact-variant',
      productRevision: next.productRevision,
      shippingCents: obs.shippingKnown ? obs.shippingCents : null,
      shippingKnown: !!obs.shippingKnown,
      availability: 'in-stock',
      tax: 'unknown',
      membership: 'separate',
      promo: 'separate',
      condition: 'new',
      change: change
    };
    next.history = (next.history || []).concat([entry]);
    next.offer = Object.assign({}, entry, { stale: false });
    next.spentCents = spent;
    next.spentConfirmed = confirmed;
    next.status = status;
    next.idea = idea;
    return { ok: true, gift: next };
  }

  function markStale(gift) {
    var next = clone(gift);
    if (!next.offer) return { ok: true, gift: next };
    next.offer = Object.assign({}, next.offer, { stale: true });
    if (next.offer.amountCents === 0) next.offer.amountCents = gift.offer.amountCents;
    return { ok: true, gift: next };
  }

  function priceChange(prevCents, nextCents) {
    var delta = nextCents - prevCents;
    var percentTimes10 = Math.round((delta * 1000) / prevCents);
    return { deltaCents: delta, percentTimes10: percentTimes10, basis: 'exact-variant' };
  }

  function setStatus(gift, status, date) {
    var prev = { status: gift.status, purchasedAt: gift.purchasedAt, spentCents: gift.spentCents, spentConfirmed: gift.spentConfirmed };
    var next = clone(gift);
    next.status = status;
    if (status === 'purchased') {
      next.purchasedAt = date || gift.purchasedAt || null;
    } else {
      next.purchasedAt = null;
    }
    return { gift: next, undo: prev };
  }

  function confirmSpent(gift, cents) {
    var next = clone(gift);
    next.spentCents = cents;
    next.spentConfirmed = true;
    return next;
  }

  function totals(gifts) {
    var whole = emptyTotals();
    var people = {};
    (gifts || []).forEach(function (gift) {
      if (!gift || gift.deleted) return;
      if (!people[gift.recipientId]) people[gift.recipientId] = emptyTotals();
      addOne(whole, gift);
      addOne(people[gift.recipientId], gift);
    });
    whole.people = people;
    return whole;
  }

  function emptyTotals() {
    return { spentCents: 0, spentKnownCount: 0, purchasedUnpricedCount: 0, remainingCents: 0, remainingKnownCount: 0, unknownPriceCount: 0, count: 0 };
  }

  function addOne(bucket, gift) {
    bucket.count += 1;
    var qty = gift.quantity > 0 ? gift.quantity : 1;
    if (gift.status === 'purchased') {
      if (gift.spentConfirmed && gift.spentCents != null) {
        bucket.spentCents += gift.spentCents;
        bucket.spentKnownCount += 1;
      } else bucket.purchasedUnpricedCount += 1;
      return;
    }
    if (gift.offer && gift.offer.stale !== true && gift.offer.amountCents > 0 && gift.offer.basis === 'exact-variant') {
      bucket.remainingCents += gift.offer.amountCents * qty;
      bucket.remainingKnownCount += 1;
    } else bucket.unknownPriceCount += 1;
  }

  function runPriceRoutine(config, gifts, transport) {
    var list = gifts || [];
    var before = JSON.stringify(list);
    var ready = config && config.readiness === 'ready' && config.gifts && config.gifts.priceUpsertEndpoint;
    if (!ready || !transport || !transport.implemented) {
      return { ran: false, sent: false, reason: 'not-connected', mutated: before !== JSON.stringify(list) };
    }
    var exact = list.filter(exactEnough);
    if (!exact.length) return { ran: false, sent: false, reason: 'no-items', mutated: false };
    return { ran: false, sent: false, reason: 'not-connected', mutated: false };
  }

  return {
    dollarsToCents: dollarsToCents,
    retailLink: retailLink,
    blankGift: blankGift,
    exactEnough: exactEnough,
    compareLabel: compareLabel,
    applyObservation: applyObservation,
    markStale: markStale,
    priceChange: priceChange,
    setStatus: setStatus,
    confirmSpent: confirmSpent,
    totals: totals,
    runPriceRoutine: runPriceRoutine
  };
});
