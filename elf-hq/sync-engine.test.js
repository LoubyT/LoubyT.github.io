'use strict';
const assert = require('assert');
const Live = require('./sync-engine');
const G = require('./gifts');

function waitFor(fn, ms) {
  const start = Date.now();
  return new Promise(function (resolve, reject) {
    (function tick() {
      let value;
      try { value = fn(); } catch (e) { reject(e); return; }
      if (value) return resolve(Date.now() - start);
      if (Date.now() - start > ms) return reject(new Error('timed out'));
      setTimeout(tick, 20);
    })();
  });
}

(async function () {
  const server = Live.createSimServer();
  assert.strictEqual(server.kind, 'simulated-test-server');
  assert.strictEqual(server.deployed, false);

  const a = Live.createSession({ server: server, pollMs: 100 });
  const b = Live.createSession({ server: server, pollMs: 100 });
  await a.start();
  await b.start();

  const t0 = Date.now();
  await a.commit('story.day-01.note', 'Pip stole the pencil.');
  const ab = await waitFor(function () { return b.get('story.day-01.note') === 'Pip stole the pencil.'; }, 5000);
  console.log('SIMULATED latency A to B ms=' + ab + ' kind=' + server.kind + ' deployed=' + server.deployed);

  const t1 = Date.now();
  let gift = G.blankGift('g1', 'sample-1');
  gift.idea = 'Red bells';
  gift.quantity = 2;
  gift = G.setStatus(gift, 'purchased', '2026-12-02').gift;
  gift = G.confirmSpent(gift, 1599);
  await b.commit('gift.g1', gift);
  const ba = await waitFor(function () {
    const got = a.get('gift.g1');
    return got && got.spentCents === 1599 && got.status === 'purchased';
  }, 5000);
  console.log('SIMULATED latency B to A ms=' + ba + ' kind=' + server.kind + ' deployed=' + server.deployed);
  assert.ok(ab <= 5000 && ba <= 5000);
  assert.ok(ab >= 0 && ba >= 0);
  void t0; void t1;

  await a.commit('story.day-01.setup', 'By the pantry door');
  await b.commit('supply.ribbon', { name: 'Red ribbon', state: 'owned', needDate: '2026-12-02' });
  await waitFor(function () {
    var ribbon = a.get('supply.ribbon');
    return b.get('story.day-01.setup') === 'By the pantry door' && ribbon && ribbon.state === 'owned';
  }, 5000);

  const baseNote = a.view().fields['story.day-01.note'];
  assert.strictEqual(baseNote, 'Pip stole the pencil.');
  const a2 = Live.createSession({ server: server, pollMs: 1000 });
  const b2 = Live.createSession({ server: server, pollMs: 1000 });
  await a2.start();
  await b2.start();
  await a2.commit('story.day-02.title', 'One');
  await b2.commit('story.day-02.title', 'Two');
  await waitFor(function () { return a2.view().conflicts.length || b2.view().conflicts.length; }, 5000);
  const conflicted = a2.view().conflicts.length ? a2 : b2;
  const other = conflicted === a2 ? b2 : a2;
  const conflict = conflicted.view().conflicts[0];
  assert.strictEqual(conflict.path, 'story.day-02.title');
  assert.ok(conflict.local === 'One' || conflict.local === 'Two');
  assert.ok(conflict.server === 'One' || conflict.server === 'Two');
  assert.notStrictEqual(conflict.local, conflict.server);
  await conflicted.resolve(conflict.path, 'server');
  await waitFor(function () {
    return a2.get('story.day-02.title') === b2.get('story.day-02.title') && a2.view().conflicts.length === 0;
  }, 5000);
  void other;

  b.suspend();
  assert.strictEqual(b.view().asleep, true);
  await a.commit('story.day-03.note', 'While the other phone slept');
  await new Promise(function (r) { setTimeout(r, 250); });
  assert.notStrictEqual(b.get('story.day-03.note'), 'While the other phone slept');
  await b.resume();
  await waitFor(function () { return b.get('story.day-03.note') === 'While the other phone slept'; }, 5000);

  server.fail = true;
  await b.commit('story.day-04.note', 'Written offline');
  assert.strictEqual(b.view().state, 'offline');
  assert.ok(b.view().unsent >= 1);
  assert.notStrictEqual(a.get('story.day-04.note'), 'Written offline');
  server.fail = false;
  await b.resume();
  await waitFor(function () { return a.get('story.day-04.note') === 'Written offline'; }, 5000);

  await a.commit('gift.g2', G.blankGift('g2', 'sample-2'));
  const stale = Live.createSession({ server: server, pollMs: 5000 });
  await stale.start();
  await waitFor(function () { return stale.get('gift.g2'); }, 5000);
  stale.suspend();
  await a.remove('gift.g2');
  await waitFor(function () { return b.get('gift.g2') == null; }, 5000);
  await stale.commit('gift.g2', Object.assign(G.blankGift('g2', 'sample-2'), { idea: 'resurrect' }));
  assert.ok(stale.view().conflicts.some(function (c) { return c.path === 'gift.g2' && c.serverDeleted; }));
  await new Promise(function (r) { setTimeout(r, 300); });
  assert.strictEqual(a.get('gift.g2'), undefined);
  stale.stop();

  b.focus('story.day-01.note');
  b.draft('story.day-01.note', 'Still typing');
  await a.commit('story.day-01.note', 'From the other phone');
  await waitFor(function () { return b.view().fields['story.day-01.note'] === 'Still typing'; }, 1000);
  assert.strictEqual(b.get('story.day-01.note'), 'Still typing');

  const lone = Live.open({ endpoint: null });
  await lone.commit('story.day-01.note', 'only here');
  assert.strictEqual(lone.view().state, 'disconnected');
  assert.strictEqual(lone.view().deployed, false);
  assert.strictEqual(lone.view().connected, false);
  assert.strictEqual(lone.fetches(), 0);
  assert.notStrictEqual(a.get('story.day-01.note'), 'only here');

  const op = { id: 'same-op', changes: [{ path: 'story.day-09.note', value: 'once', baseRev: 0, deleted: false }] };
  const first = await server.push(op);
  const second = await server.push(op);
  assert.strictEqual(JSON.stringify(first), JSON.stringify(second));

  a.stop(); b.stop(); a2.stop(); b2.stop(); stale.stop();
  console.log('ok sync engine tests');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
