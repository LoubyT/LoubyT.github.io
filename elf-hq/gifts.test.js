'use strict';
const assert = require('assert');
const G = require('./gifts');

let n = 0;
function test(name, fn) { fn(); n += 1; console.log('ok', name); }

test('cents parse without float drift', function () {
  assert.strictEqual(G.dollarsToCents('12').cents, 1200);
  assert.strictEqual(G.dollarsToCents('12.3').cents, 1230);
  assert.strictEqual(G.dollarsToCents('12.30').cents, 1230);
  assert.strictEqual(G.dollarsToCents('0').cents, 0);
  assert.strictEqual(G.dollarsToCents('12.345').ok, false);
  assert.strictEqual(G.dollarsToCents('').ok, false);
});

test('links are https and not fetched', function () {
  assert.strictEqual(G.retailLink('http://shop.example/a').ok, false);
  assert.strictEqual(G.retailLink('javascript:alert(1)').ok, false);
  assert.strictEqual(G.retailLink('https://user:pass@shop.example/a').ok, false);
  const ok = G.retailLink('https://shop.example/item/1');
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.href, 'https://shop.example/item/1');
});

test('vague ideas are not priced as zero', function () {
  const gift = G.blankGift('g1', 'sample-1');
  gift.idea = 'Something cozy';
  assert.strictEqual(G.exactEnough(gift), false);
  assert.strictEqual(G.compareLabel(gift), 'Choose exact item to compare');
  const t = G.totals([gift]);
  assert.strictEqual(t.unknownPriceCount, 1);
  assert.strictEqual(t.remainingCents, 0);
  assert.strictEqual(t.staleCents, 0);
  assert.strictEqual(t.spentCents, 0);
  assert.strictEqual(G.remainingDisplay(t).text, '\u2014');
});

test('exact offer, history, quantity, and spent stay apart', function () {
  let gift = G.blankGift('g1', 'sample-1');
  gift.url = 'https://shop.example/bell';
  gift.variant = { size: '', color: 'red', model: 'bell-2', pack: '4' };
  gift.quantity = 3;
  gift = G.confirmSpent(gift, 1999);
  gift = G.setStatus(gift, 'planned').gift;
  const first = G.applyObservation(gift, {
    productRevision: 1, amountCents: 250, basis: 'exact-variant', condition: 'new',
    availability: 'in-stock', sellerCount: 4, sourceUrl: 'https://shop.example/bell',
    shippingKnown: false, checkedAt: '2026-11-08T15:00:00Z'
  });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.gift.spentCents, 1999);
  const second = G.applyObservation(first.gift, {
    productRevision: 1, amountCents: 200, basis: 'exact-variant', condition: 'new',
    availability: 'in-stock', sellerCount: 3, sourceUrl: 'https://shop.example/bell',
    shippingKnown: true, shippingCents: 50, checkedAt: '2026-11-09T15:00:00Z'
  });
  assert.strictEqual(second.gift.offer.change.deltaCents, -50);
  assert.strictEqual(second.gift.offer.change.percentTimes10, -200);
  assert.strictEqual(second.gift.offer.shippingCents, 50);
  assert.strictEqual(second.gift.offer.tax, 'unknown');
  assert.strictEqual(second.gift.spentCents, 1999);
  const planned = G.setStatus(second.gift, 'planned').gift;
  const sums = G.totals([planned]);
  assert.strictEqual(sums.remainingCents, 600);
  assert.strictEqual(sums.spentCents, 0);
  const bought = G.setStatus(planned, 'purchased', '2026-12-02').gift;
  assert.strictEqual(bought.purchasedAt, '2026-12-02');
  assert.strictEqual(bought.spentConfirmed, true);
  const after = G.totals([bought]);
  assert.strictEqual(after.spentCents, 1999);
  assert.strictEqual(after.remainingCents, 0);
});

test('bad offers do not become zero and do not move a purchase', function () {
  let gift = G.blankGift('g2', 'sample-2');
  gift.url = 'https://shop.example/jar';
  gift.variant.model = 'jar';
  gift = G.setStatus(G.confirmSpent(gift, 500), 'purchased', '2026-12-01').gift;
  gift = G.applyObservation(gift, {
    productRevision: 1, amountCents: 400, basis: 'exact-variant', condition: 'new',
    availability: 'in-stock', sellerCount: 2, sourceUrl: 'https://shop.example/jar', checkedAt: 't'
  }).gift;
  const stock = G.applyObservation(gift, {
    productRevision: 1, amountCents: 100, basis: 'exact-variant', condition: 'new',
    availability: 'out-of-stock', sellerCount: 1, sourceUrl: 'https://shop.example/jar', checkedAt: 't2'
  });
  assert.strictEqual(stock.ok, false);
  assert.strictEqual(stock.gift.offer.amountCents, 400);
  assert.strictEqual(stock.gift.offer.stale, true);
  assert.strictEqual(stock.gift.spentCents, 500);
  const used = G.applyObservation(gift, {
    productRevision: 1, amountCents: 50, basis: 'exact-variant', condition: 'used',
    availability: 'in-stock', sellerCount: 1, sourceUrl: 'https://shop.example/jar', checkedAt: 't3'
  });
  assert.strictEqual(used.ok, false);
  assert.strictEqual(used.gift.offer.amountCents, 400);
  const moved = G.applyObservation(gift, {
    productRevision: 2, amountCents: 10, basis: 'exact-variant', condition: 'new',
    availability: 'in-stock', sellerCount: 2, sourceUrl: 'https://shop.example/jar', checkedAt: 't4'
  });
  assert.strictEqual(moved.ok, false);
  assert.strictEqual(moved.code, 'revision');
  assert.strictEqual(moved.gift.offer.amountCents, 400);
  const zero = G.applyObservation(gift, {
    productRevision: 1, amountCents: 0, basis: 'exact-variant', condition: 'new',
    availability: 'in-stock', sellerCount: 2, sourceUrl: 'https://shop.example/jar', checkedAt: 't5'
  });
  assert.strictEqual(zero.ok, false);
  assert.notStrictEqual(zero.gift.offer.amountCents, 0);
});

test('percent rounding and bought-without-amount', function () {
  assert.strictEqual(G.priceChange(1000, 1100).percentTimes10, 100);
  assert.strictEqual(G.priceChange(333, 500).deltaCents, 167);
  assert.strictEqual(G.priceChange(333, 500).percentTimes10, 502);
  const gift = G.setStatus(G.blankGift('g3', 'sample-1'), 'purchased', '2026-12-03').gift;
  const t = G.totals([gift]);
  assert.strictEqual(t.spentCents, 0);
  assert.strictEqual(t.purchasedUnpricedCount, 1);
  assert.strictEqual(t.unknownPriceCount, 0);
});

test('morning price run is a no-op without items or a connection', function () {
  let fetches = 0;
  const gifts = [G.blankGift('g1', 'sample-1')];
  const idle = G.runPriceRoutine({ readiness: 'not-configured' }, gifts, { implemented: false, fetch: function () { fetches += 1; } });
  assert.strictEqual(idle.sent, false);
  assert.strictEqual(idle.reason, 'not-connected');
  assert.strictEqual(fetches, 0);
  assert.strictEqual(idle.mutated, false);
  const ready = G.runPriceRoutine({ readiness: 'ready', gifts: { priceUpsertEndpoint: 'https://example.invalid/prices' } }, gifts, { implemented: true, fetch: function () { fetches += 1; } });
  assert.strictEqual(ready.reason, 'no-items');
  assert.strictEqual(fetches, 0);
});

test('gift book keeps edits, filters, and a down chip', function () {
  n += 1;
  const book = G.saveGift(G.emptyGiftBook(), [{ id: 'sample-gift-2' }], {
    id: 'sample-gift-2', idea: 'Picture book', status: 'planned', deleted: false,
    offer: { stale: false, change: { deltaCents: -300 }, sellerCount: 3, amountCents: 1299 }
  });
  const added = G.saveGift(book, [{ id: 'sample-gift-2' }], { id: 'new-1', idea: 'Scarf', status: 'idea', deleted: false, offer: null });
  const list = G.listGifts([{ id: 'sample-gift-2', idea: 'Old' }, { id: 'sample-gift-1', idea: 'Mittens', status: 'purchased' }], added);
  assert.strictEqual(list.find((g) => g.id === 'sample-gift-2').idea, 'Picture book');
  assert.ok(list.some((g) => g.id === 'new-1'));
  const gone = G.deleteGift(added, 'new-1');
  assert.ok(!G.listGifts([], gone).some((g) => g.id === 'new-1'));
  assert.strictEqual(G.passesFilter({ status: 'purchased', deleted: false }, 'remaining'), false);
  assert.strictEqual(G.passesFilter({ status: 'planned', deleted: false }, 'remaining'), true);
  assert.strictEqual(G.chipFor({ offer: { stale: false, change: { deltaCents: -300 } } }).dir, 'down');
  assert.strictEqual(G.chipFor({ offer: { stale: true, change: { deltaCents: -300 } } }), null);
  assert.ok(G.checkedLine({ offer: { stale: true, sellerCount: 2 } }, 'Oct 20').indexOf('may be old') !== -1);
});

test('person chips count what is still to buy and narrow the totals', function () {
  n += 1;
  const gifts = [
    { id: 'a', recipientId: 'sample-1', status: 'purchased', deleted: false, spentCents: 1800, spentConfirmed: true },
    { id: 'b', recipientId: 'sample-2', status: 'planned', deleted: false, quantity: 1, offer: { amountCents: 1299, stale: false, basis: 'exact-variant' } },
    { id: 'c', recipientId: 'sample-4', status: 'planned', deleted: false, offer: { amountCents: 2400, stale: true, basis: 'exact-variant' } }
  ];
  const people = [{ id: 'sample-1' }, { id: 'sample-2' }, { id: 'sample-4' }];
  assert.strictEqual(G.remainingCount(gifts), 2);
  assert.strictEqual(G.remainingCount(G.giftsForPerson(gifts, 'sample-1')), 0);
  assert.strictEqual(G.remainingCount(G.giftsForPerson(gifts, 'sample-4')), 1);
  assert.strictEqual(G.keepPerson('sample-4', people), 'sample-4');
  assert.strictEqual(G.keepPerson('missing', people), 'all');
  assert.strictEqual(G.keepPerson('all', people), 'all');
  const mine = G.giftsForPerson(gifts, 'sample-2');
  const totals = G.totals(mine);
  assert.strictEqual(totals.remainingCents, 1299);
  assert.strictEqual(totals.spentCents, 0);
  const shown = mine.filter(function (gift) { return G.passesFilter(gift, 'remaining'); });
  assert.strictEqual(shown.length, 1);
  assert.strictEqual(G.giftsForPerson(gifts, 'sample-1').filter(function (gift) { return G.passesFilter(gift, 'remaining'); }).length, 0);
  const stale = G.totals(G.giftsForPerson(gifts, 'sample-4'));
  assert.strictEqual(stale.remainingCents, 0);
  assert.strictEqual(stale.staleCents, 2400);
  assert.strictEqual(stale.unknownPriceCount, 0);
  const shownStale = G.remainingDisplay(stale);
  assert.strictEqual(shownStale.text, '~$24.00');
  assert.strictEqual(shownStale.note, 'may be old');
  assert.strictEqual(G.totalDisplay(stale).text, '~$24.00');
  const mixed = G.totals(gifts);
  assert.strictEqual(G.remainingDisplay(mixed).text, '~$36.99');
  assert.strictEqual(mixed.unknownPriceCount, 0);
});

console.log('ok ' + n + ' gift tests');
