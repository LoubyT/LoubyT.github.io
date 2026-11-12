'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const K = require('./kids-list');

function item(extra) {
  return Object.assign({
    id: 'toy-1',
    order: 1,
    title: 'A sample drum',
    price: 10,
    url: 'https://www.example.com/toy',
    image: 'https://m.media-amazon.com/images/I/sample._SL500_.jpg',
    person: 'Zelda',
    locked: false
  }, extra || {});
}

const book = K.ensureAll(K.empty(), [
  item(),
  item({ id: 'toy-2', order: 2, person: 'Leo', price: 2.5 }),
  item({ id: 'toy-3', order: 3, person: 'Unsorted', price: null, image: null }),
  item({ id: 'pad', order: 4, person: 'Leo', price: 5, url: 'https://www.example.com/pad', image: null, locked: true })
]).book;

assert.strictEqual(K.list(book).length, 4);
assert.strictEqual(K.priceLabel(K.get(book, 'toy-3')), 'price n/a');
assert.strictEqual(K.totals(K.list(book)).totalCents, 1000 + 250 + 0 + 500);
assert.strictEqual(K.totals(K.list(book)).people.Leo, 750);
assert.strictEqual(K.totals([{ priceCents: 82100, person: 'Zelda', removed: false }]).under, true);
assert.strictEqual(K.totals([{ priceCents: 82101, person: 'Zelda', removed: false }]).under, false);
assert.strictEqual(K.totals([{ priceCents: 82099, person: 'Leo', removed: false }]).deltaCents, 1);

const locked = K.remove(book, 'pad');
assert.strictEqual(locked.ok, false);
assert.strictEqual(locked.code, 'locked');
assert.strictEqual(K.get(locked.book, 'pad').removed, false);

const gone = K.remove(book, 'toy-1');
assert.strictEqual(gone.ok, true);
assert.strictEqual(K.totals(K.list(gone.book)).totalCents, 750);
assert.strictEqual(K.totals(K.list(gone.book)).removed, 1);
const back = K.restore(gone.book, 'toy-1');
assert.strictEqual(K.get(back.book, 'toy-1').removed, false);
const again = K.remove(K.remove(book, 'toy-1').book, 'toy-2');
const all = K.restoreAll(again.book);
assert.strictEqual(all.items.length, 2);
assert.strictEqual(K.list(all.book).filter(function (row) { return row.removed; }).length, 0);

const moved = K.assign(book, 'toy-3', 'Leo');
assert.strictEqual(moved.item.person, 'Leo');
assert.strictEqual(K.assign(book, 'toy-3', 'Neighbor').ok, false);
assert.strictEqual(K.normalize(item({ person: 'Neighbor' })), null);
assert.strictEqual(K.normalize(item({ url: 'http://www.example.com/toy' })), null);
assert.ok(K.normalize(item({ image: 'https://m.media-amazon.com/images/I/sample._SL500_.jpg' })).image.indexOf('m.media-amazon.com') > 0);

const kept = K.ensureAll(gone.book, [item()]);
assert.strictEqual(kept.added.length, 0);
assert.strictEqual(K.get(kept.book, 'toy-1').removed, true);

assert.strictEqual(K.money(605944), '$6,059.44');
assert.strictEqual(K.money(82100), '$821.00');
assert.strictEqual(K.money(1), '$0.01');

const root = __dirname;
fs.readdirSync(root).forEach(function (name) {
  if (/\.test\.js$/.test(name)) return;
  if (!/\.(js|html|css|json|webmanifest)$/.test(name)) return;
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  assert.ok(text.indexOf('amazon.com/dp/') === -1, name + ' has a product url');
  assert.ok(text.indexOf('vevor.com') === -1, name + ' has a private shop url');
});

const norm = require('./plan-model').normalizeOverrides({
  schemaVersion: 1,
  kind: 'rehearsal-scratchpad',
  containsPrivate: true,
  kids: { byId: { 'toy-1': K.get(book, 'toy-1') } }
});
assert.strictEqual(norm.overrides.kids.byId['toy-1'].title, 'A sample drum');
assert.strictEqual(require('./plan-model').blankOverrides().kids.byId && Object.keys(require('./plan-model').blankOverrides().kids.byId).length, 0);

console.log('ok kids list');
