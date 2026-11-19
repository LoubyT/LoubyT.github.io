'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const B = require('./buying-list');

function row(extra) {
  return Object.assign({
    id: 'buy-SAMPLE0001',
    order: 1,
    title: 'A sample lantern',
    priceCents: 1099,
    listCents: 1499,
    deal: '',
    couponCents: 0,
    variant: 'Green',
    url: 'https://shop.example/lantern',
    note: '',
    timing: 'later'
  }, extra || {});
}

const book = B.ensureAll(B.empty(), [
  row({ id: 'buy-SAMPLE0001', order: 2, timing: 'later', priceCents: 2000 }),
  row({ id: 'buy-SAMPLE0002', order: 1, timing: 'bf', priceCents: 1000, couponCents: 100 }),
  row({ id: 'buy-SAMPLE0001', order: 9, title: 'Duplicate must not win' })
]).book;

assert.strictEqual(B.list(book).length, 2);
assert.strictEqual(B.list(book)[0].id, 'buy-SAMPLE0002');
assert.strictEqual(B.effectiveCents(B.get(book, 'buy-SAMPLE0002')), 900);
const sum = B.totals(B.list(book));
assert.strictEqual(sum.preCents, 2900);
assert.strictEqual(sum.taxCents, B.taxCents(2900));
assert.strictEqual(sum.under, true);
assert.strictEqual(sum.leftCents, B.BUDGET_CENTS - 2900);

const bought = B.patch(book, 'buy-SAMPLE0002', { bought: true });
assert.strictEqual(B.totals(B.list(bought.book)).preCents, 2000);
const gone = B.patch(book, 'buy-SAMPLE0001', { removed: true });
assert.strictEqual(B.totals(B.list(gone.book)).preCents, 900);
const again = B.ensureAll(gone.book, [row()]);
assert.strictEqual(again.added.length, 0);
assert.strictEqual(B.get(again.book, 'buy-SAMPLE0001').removed, true);
assert.strictEqual(B.normalize(row({ url: 'http://shop.example/lantern' })), null);
assert.strictEqual(B.normalize(row({ timing: 'other' })).timing, 'later');
assert.strictEqual(B.FRIDAY_CENTS + B.DECEMBER_CENTS, B.BUDGET_CENTS);
assert.strictEqual(B.timingLabel('bf'), 'Buy Black Friday');
assert.strictEqual(B.timingLabel('later'), 'BF or December');

const root = __dirname;
fs.readdirSync(root).forEach(function (name) {
  if (/\.test\.js$/.test(name)) return;
  if (!/\.(js|html|css|json|webmanifest)$/.test(name)) return;
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  assert.ok(text.indexOf('amazon.com/dp/') === -1, name + ' has a product url');
});

console.log('ok buying list');
