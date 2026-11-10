'use strict';

const assert = require('assert');
const P = require('./plan-model');
const demo = require('./demo-plan');
const media = require('./media-manifest');
const scenes = require('./scene-art');
const sync = require('./sync-port');
const M = require('./monitor-contract');

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(function () {
    passed += 1;
  }, function (err) {
    console.error('FAIL', name);
    console.error(err && err.stack || err);
    process.exitCode = 1;
  });
}

function finalized() {
  const result = P.finalizeFixture(demo.raw);
  assert.deepStrictEqual(result.errors, [], 'fixture errors: ' + result.errors.join(','));
  return result.fixture;
}

(async function main() {
  await test('season is December 1–25 2026 in order', function () {
    const fx = finalized();
    assert.strictEqual(fx.season.startDate, '2026-12-01');
    assert.strictEqual(fx.season.timeZone, 'America/Chicago');
    assert.strictEqual(fx.days.length, 25);
    fx.days.forEach(function (d, i) {
      assert.strictEqual(d.number, i + 1);
      assert.strictEqual(P.displayDateForNumber(d.number, fx.season), '2026-12-' + String(i + 1).padStart(2, '0'));
    });
    assert.strictEqual(P.weekdayOfKey('2026-12-01'), 'Tuesday');
    assert.strictEqual(P.weekdayOfKey('2026-12-12'), 'Saturday');
    assert.strictEqual(P.weekdayOfKey('2026-12-13'), 'Sunday');
    assert.strictEqual(P.weekdayOfKey('2026-12-19'), 'Saturday');
    assert.strictEqual(P.weekdayOfKey('2026-12-20'), 'Sunday');
    assert.strictEqual(P.weekdayOfKey('2026-12-25'), 'Friday');
  });

  await test('Chicago date, not UTC, picks the page', function () {
    const fx = finalized();
    const before = P.seasonPhase(new Date('2026-12-01T05:30:00Z'), fx.season);
    assert.strictEqual(before.phase, 'before');
    assert.strictEqual(before.todayKey, '2026-11-30');
    assert.strictEqual(before.todayNumber, null);
    const start = P.seasonPhase(new Date('2026-12-01T06:05:00Z'), fx.season);
    assert.strictEqual(start.phase, 'during');
    assert.strictEqual(start.todayNumber, 1);
    const late = P.seasonPhase(new Date('2026-12-12T03:30:00Z'), fx.season);
    assert.strictEqual(late.todayKey, '2026-12-11');
    assert.strictEqual(late.todayNumber, 11);
    const last = P.seasonPhase(new Date('2026-12-26T04:30:00Z'), fx.season);
    assert.strictEqual(last.phase, 'during');
    assert.strictEqual(last.todayNumber, 25);
    const after = P.seasonPhase(new Date('2026-12-26T06:30:00Z'), fx.season);
    assert.strictEqual(after.phase, 'after');
    const nov = P.seasonPhase(new Date('2026-11-08T20:00:00Z'), fx.season);
    assert.strictEqual(nov.phase, 'before');
    assert.strictEqual(nov.zoned.weekday, 'Sunday');
    assert.strictEqual(P.greeting(nov.zoned.hour, ''), 'Good afternoon.');
    assert.strictEqual(P.greeting(21, 'Ada'), 'Good night, Ada.');
    const beforeMidnight = P.mood(new Date('2026-12-01T05:59:00Z'));
    assert.strictEqual(beforeMidnight.dateKey, '2026-11-30');
    assert.strictEqual(beforeMidnight.part, 'night');
    assert.strictEqual(beforeMidnight.feast, '');
    const midnight = P.mood(new Date('2026-12-01T06:00:00Z'));
    assert.strictEqual(midnight.dateKey, '2026-12-01');
    assert.strictEqual(midnight.part, 'night');
    const opened = P.buildView(fx, P.blankOverrides(), new Date('2026-12-01T06:00:00Z'));
    assert.strictEqual(opened.phase.todayNumber, 1);
    assert.strictEqual(opened.shown.day.number, 1);
    const morning = P.mood(new Date('2026-12-01T15:00:00Z'));
    assert.strictEqual(morning.part, 'morning');
    assert.strictEqual(morning.hour, 9);
    const eve = P.mood(new Date('2026-12-25T02:00:00Z'));
    assert.strictEqual(eve.dateKey, '2026-12-24');
    assert.strictEqual(eve.feast, 'eve');
    assert.strictEqual(eve.part, 'evening');
    const christmas = P.mood(new Date('2026-12-25T15:00:00Z'));
    assert.strictEqual(christmas.dateKey, '2026-12-25');
    assert.strictEqual(christmas.feast, 'day');
    assert.strictEqual(christmas.part, 'morning');
    const afterChristmas = P.buildView(fx, P.blankOverrides(), new Date('2026-12-26T18:00:00Z'));
    assert.strictEqual(afterChristmas.phase.phase, 'after');
    assert.strictEqual(afterChristmas.shown.day.number, 25);
    assert.strictEqual(P.mood(new Date('2026-12-26T18:00:00Z')).feast, '');
  });

  await test('date rollover does not rewrite edits', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.setField(ov, 'day-03', 'description', 'My sentence', 't1');
    const beforeRev = ov.contentRevision;
    const snap = JSON.stringify(ov);
    const early = P.buildView(fx, ov, new Date('2026-11-08T18:00:00Z'));
    const later = P.buildView(fx, ov, new Date('2026-12-12T18:00:00Z'));
    assert.strictEqual(JSON.stringify(ov), snap);
    assert.strictEqual(ov.contentRevision, beforeRev);
    assert.strictEqual(early.phase.phase, 'before');
    assert.strictEqual(early.shown.mode, 'upcoming');
    assert.strictEqual(early.shown.day.number, 1);
    assert.strictEqual(later.phase.todayNumber, 12);
    assert.strictEqual(later.shown.mode, 'today');
    assert.strictEqual(later.days[2].description, 'My sentence');
  });

  await test('fixture text updates do not clobber an edit', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.setField(ov, 'day-01', 'description', 'Kept', 't');
    const changed = Object.assign({}, fx.days[0], { description: 'New fixture copy', title: 'New title' });
    const merged = P.applyDay(changed, ov.days['day-01'], fx.season);
    assert.strictEqual(merged.description, 'Kept');
    assert.strictEqual(merged.title, 'New title');
    const fresh = P.applyDay(changed, undefined, fx.season);
    assert.strictEqual(fresh.description, 'New fixture copy');
  });

  await test('removed fixture steps the user touched are kept', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    const base = Object.assign({}, fx.days[0], { prep: [{ id: 'step-a', label: 'Lay the cloth' }] });
    P.setCheckDone(ov, 'day-01', 'prep', 'step-a', true, 't');
    const merged = P.applyDay(Object.assign({}, base, { prep: [] }), ov.days['day-01'], fx.season);
    const kept = merged.prepChecks.find(function (c) { return c.id === 'step-a'; });
    assert.ok(kept && kept.orphaned && kept.done);
    assert.strictEqual(merged.contentRevision, 0);
  });

  await test('user can delete a step and it stays deleted', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    const base = Object.assign({}, fx.days[5], { prep: [{ id: 'step-b', label: 'Thread' }] });
    P.removeCheck(ov, 'day-06', 'prep', 'step-b');
    const merged = P.applyDay(base, ov.days['day-06'], fx.season);
    assert.ok(!merged.prepChecks.some(function (c) { return c.id === 'step-b'; }));
    assert.strictEqual(ov.contentRevision, 0);
    assert.ok(ov.listRevision > 0);
  });

  await test('Saturday pages are not moved when the note says Sunday', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.setField(ov, 'day-12', 'note', 'Sunday. The hands-on part might be the evening before. That is only a guess.', 't0');
    const bells = P.applyDay(fx.days[11], ov.days['day-12'], fx.season);
    assert.strictEqual(bells.displayDate, '2026-12-12');
    assert.strictEqual(bells.weekday, 'Saturday');
    assert.strictEqual(P.weekdayOfKey('2026-12-19'), 'Saturday');
    assert.ok(bells.hint && bells.hint.moved === false && bells.hint.confirmedDeadline === false);
    assert.ok(bells.hint.mentioned.indexOf('Sunday') !== -1);
    assert.strictEqual(bells.prep.source, 'none');
    assert.strictEqual(bells.prep.date, null);
    P.setPrepDate(ov, 'day-12', '2026-12-10', 't');
    const chosen = P.applyDay(fx.days[11], ov.days['day-12'], fx.season);
    assert.strictEqual(chosen.displayDate, '2026-12-12');
    assert.strictEqual(chosen.prep.date, '2026-12-10');
    assert.strictEqual(chosen.prep.source, 'date');
    P.setField(ov, 'day-12', 'note', 'No weekday in this sentence.', 't2');
    const cleared = P.applyDay(fx.days[11], ov.days['day-12'], fx.season);
    assert.strictEqual(cleared.hint, null);
    assert.strictEqual(cleared.displayDate, '2026-12-12');
  });

  await test('lead time you set is not the calendar date', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.setLeadDays(ov, 'day-10', 4, 't');
    const moons = P.applyDay(fx.days[9], ov.days['day-10'], fx.season);
    assert.strictEqual(moons.displayDate, '2026-12-10');
    assert.strictEqual(moons.prep.source, 'lead');
    assert.strictEqual(moons.prep.date, '2026-12-06');
  });

  await test('shopping groups and tombstones', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.addShopping(ov, { id: 'shop-bells', name: 'Little bells', needDate: '2026-12-11', needBasis: 'suggestion', suggestionNote: 'Guess only.', state: 'need' }, 't');
    const patched = P.applyShopping(fx.shopping, ov.shopping);
    const suggestionItem = patched.find(function (i) { return i.id === 'shop-bells'; });
    suggestionItem.needBasis = 'suggestion';
    const groups = P.groupShopping(patched.concat([{ id: 'shop-loose', name: 'Spare thread', needDate: null, needBasis: 'none', state: 'need', qtyNote: '', suggestionNote: '' }]), '2026-12-12', fx.season.timeZone);
    const suggestion = groups.find(function (g) { return g.tone === 'suggestion'; });
    assert.ok(suggestion.items.some(function (i) { return i.id === 'shop-bells'; }));
    const undated = groups.find(function (g) { return g.tone === 'undated'; });
    assert.ok(undated.items.some(function (i) { return i.id === 'shop-loose'; }));
    const text = P.shoppingPlainText(groups);
    assert.ok(text.indexOf('Walmart, Bastrop') !== -1);
    assert.ok(!/\$|\bprice\b/i.test(text));
    P.removeShopping(ov, 'shop-bells');
    const again = P.applyShopping(fx.shopping, ov.shopping);
    assert.ok(!again.some(function (i) { return i.id === 'shop-bells'; }));
    const id = P.addShopping(ov, { name: 'Plain flour', needDate: '2026-12-09' }, 't');
    const withNew = P.applyShopping(fx.shopping, ov.shopping);
    assert.ok(withNew.some(function (i) { return i.id === id && i.needBasis === 'date'; }));
    P.setShoppingState(ov, id, 'owned', 't2');
    const owned = P.applyShopping(fx.shopping, ov.shopping).find(function (i) { return i.id === id; });
    assert.strictEqual(owned.state, 'owned');
  });

  await test('peek is not a date change and is not in the sync document', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    const rev = ov.contentRevision;
    P.setMeta(ov, 'peekDayId', 'day-19');
    assert.strictEqual(ov.contentRevision, rev);
    const view = P.buildView(fx, ov, new Date('2026-11-08T18:00:00Z'));
    assert.strictEqual(view.shown.mode, 'peek');
    assert.strictEqual(view.shown.day.displayDate, '2026-12-19');
    assert.strictEqual(view.phase.phase, 'before');
    const doc = P.toSyncDocument(view);
    assert.ok(!('peekDayId' in doc));
    assert.ok(!JSON.stringify(doc).includes('data:'));
    assert.strictEqual(doc.days[18].displayDate, '2026-12-19');
  });

  await test('unknown notebook schema is not overwritten', function () {
    const future = { schemaVersion: 2, kind: 'rehearsal-scratchpad', days: { 'day-01': { fields: { note: { value: 'keep me' } } } } };
    const norm = P.normalizeOverrides(future);
    assert.strictEqual(norm.canWrite, false);
    assert.strictEqual(norm.overrides, future);
    const fresh = P.normalizeOverrides(null);
    assert.strictEqual(fresh.mode, 'fresh');
    assert.strictEqual(fresh.canWrite, true);
  });

  await test('private backups are refused and photo backups are all or nothing', function () {
    const ov = P.blankOverrides();
    const text = P.buildBackup(ov, [{ id: 'p1', bytes: 10 }], 'text', 't');
    assert.strictEqual(text.ok, true);
    assert.strictEqual(text.backup.photosIncluded, false);
    assert.deepStrictEqual(text.backup.photoIdsOmitted, ['p1']);
    const big = P.buildBackup(ov, [{ id: 'p1', bytes: P.BACKUP_PHOTO_BUDGET + 1 }], 'photos', 't');
    assert.strictEqual(big.ok, false);
    assert.strictEqual(big.code, 'too-big');
    const small = P.buildBackup(ov, [{ id: 'p1', bytes: 20, dataUrl: 'data:image/jpeg;base64,aa' }], 'photos', 't');
    assert.strictEqual(small.backup.photosIncluded, true);
    const parsed = P.parseBackup(small.backup);
    assert.strictEqual(parsed.ok, true);
    const privateOv = P.blankOverrides();
    privateOv.containsPrivate = true;
    const privBuilt = P.buildBackup(privateOv, [], 'text', 't');
    assert.strictEqual(privBuilt.ok, true);
    assert.strictEqual(privBuilt.backup.containsPrivate, true);
    const priv = P.parseBackup(privBuilt.backup);
    assert.strictEqual(priv.ok, true);
    assert.strictEqual(priv.overrides.containsPrivate, true);
    assert.strictEqual(P.parseBackup({ elfHqBackup: 9 }).ok, false);
  });

  await test('photo rules refuse extras without dropping the rest', function () {
    const existing = [{ dayId: 'day-01', bytes: 1000, type: 'image/jpeg' }];
    assert.strictEqual(P.checkPhotoAdd(existing, { dayId: 'day-01', bytes: 1000, type: 'image/jpeg' }).ok, true);
    assert.strictEqual(P.checkPhotoAdd(existing, { dayId: 'day-02', bytes: 10, type: 'image/gif' }).code, 'type');
    assert.strictEqual(P.checkPhotoAdd(existing, { dayId: 'day-02', bytes: P.PHOTO_MAX_BYTES + 1, type: 'image/png' }).code, 'too-big');
    const many = [];
    for (let i = 0; i < 25; i++) many.push({ dayId: 'day-' + i, bytes: 10, type: 'image/jpeg' });
    assert.strictEqual(P.checkPhotoAdd(many, { dayId: 'new', bytes: 10, type: 'image/jpeg' }).code, 'count');
    assert.ok(P.photoError('quota').length > 20);
    const loose = P.loosePhotos(
      { days: { 'day-01': { photo: { id: 'keep' } }, 'day-02': { photo: { id: 'gone', removed: true } } } },
      [{ id: 'keep' }, { id: 'orphan' }, { id: 'gone' }]
    );
    assert.deepStrictEqual(loose.map(function (p) { return p.id; }).sort(), ['gone', 'orphan']);
  });

  await test('same-field sync conflict is kept, not overwritten', function () {
    const base = { note: { value: 'Base', rev: 1 } };
    const local = { note: { value: 'Phone A', rev: 2 } };
    const server = { note: { value: 'Phone B', rev: 3 } };
    const clash = P.mergeDocuments(base, local, server, ['note']);
    assert.strictEqual(clash.ok, false);
    assert.strictEqual(clash.conflicts[0].local, 'Phone A');
    assert.strictEqual(clash.conflicts[0].server, 'Phone B');
    const onlyServer = P.mergeDocuments(base, { note: { value: 'Base', rev: 1 } }, server, ['note']);
    assert.strictEqual(onlyServer.ok, true);
    assert.strictEqual(onlyServer.merged.note.value, 'Phone B');
    const onlyLocal = P.mergeDocuments(base, local, { note: { value: 'Base', rev: 1 } }, ['note']);
    assert.strictEqual(onlyLocal.merged.note.value, 'Phone A');
    const same = P.mergeDocuments(base, { note: { value: 'Same', rev: 2 } }, { note: { value: 'Same', rev: 4 } }, ['note']);
    assert.strictEqual(same.ok, true);
  });

  await test('media slots are 25 honest stand-ins, not repeated videos', function () {
    const errors = P.auditManifest(media.manifest);
    assert.deepStrictEqual(errors, []);
    const svgs = media.manifest.days.map(function (d) { return scenes.feltDiorama(d); });
    assert.strictEqual(new Set(svgs).size, 25);
    svgs.forEach(function (svg) {
      assert.ok(svg.indexOf('<video') === -1);
      assert.ok(!/face|smile|eye/i.test(svg));
    });
    const ready = Object.assign({}, media.manifest.days[0], { status: 'ready', src: 'media/day-01.mp4' });
    const hidden = P.planPlayback(ready, { visible: false, reducedMotion: false, saveData: false });
    assert.strictEqual(hidden.mountsVideo, false);
    const motion = P.planPlayback(ready, { visible: true, reducedMotion: true, saveData: false, userAskedPlay: false });
    assert.strictEqual(motion.mountsVideo, false);
    assert.strictEqual(motion.showPlayButton, true);
    assert.strictEqual(motion.autoplay, false);
    const asked = P.planPlayback(ready, { visible: true, reducedMotion: true, userAskedPlay: true });
    assert.strictEqual(asked.mountsVideo, true);
    assert.strictEqual(asked.playFromGesture, true);
    assert.strictEqual(asked.autoplay, false);
    const play = P.planPlayback(ready, { visible: true, reducedMotion: false, saveData: false });
    assert.strictEqual(play.autoplay, true);
    assert.strictEqual(play.muted, true);
    assert.strictEqual(play.playsinline, true);
    assert.strictEqual(play.preload, 'none');
    const data = P.planPlayback(ready, { visible: true, saveData: true });
    assert.strictEqual(data.mountsVideo, false);
    const empty = P.planPlayback(media.manifest.days[3], { visible: true });
    assert.strictEqual(empty.placeholder, true);
    assert.strictEqual(empty.mountsVideo, false);
    const featureSvg = scenes.feltFeature();
    assert.ok(svgs.indexOf(featureSvg) === -1);
    assert.ok(featureSvg.indexOf('<video') === -1);
    const feat = P.planPlayback(media.manifest.feature, { visible: true, userAskedPlay: true, authedBlob: null });
    assert.strictEqual(feat.kind, 'feature');
    assert.strictEqual(feat.autoplay, false);
    assert.strictEqual(feat.preload, 'none');
    assert.strictEqual(feat.mountsVideo, false);
    assert.strictEqual(feat.unavailable, true);
    assert.strictEqual(feat.dateLocked, false);
    assert.strictEqual(feat.controls, true);
    const armed = Object.assign({}, media.manifest.feature, { status: 'ready', rendered: true, src: 'private', captions: 'captions.vtt' });
    const held = P.planPlayback(armed, { visible: true, userAskedPlay: false, authedBlob: 'blob:ok' });
    assert.strictEqual(held.mountsVideo, false);
    assert.strictEqual(held.autoplay, false);
    assert.strictEqual(held.poster, true);
    const go = P.planPlayback(armed, { visible: true, userAskedPlay: true, authedBlob: 'blob:ok' });
    assert.strictEqual(go.autoplay, false);
    assert.strictEqual(go.mountsVideo, true);
    assert.strictEqual(go.playFromGesture, true);
    assert.strictEqual(go.preload, 'none');
    assert.strictEqual(go.controls, true);
    assert.strictEqual(go.captions, true);
  });

  await test('sync port never touches the network', async function () {
    let calls = 0;
    const port = sync.createSyncPort({
      baseUrl: 'https://example.invalid/elf',
      enabled: true,
      fetch: function () { calls += 1; return Promise.resolve({ ok: true }); }
    });
    const status = await port.status();
    assert.strictEqual(status.shared, false);
    assert.strictEqual(status.uploads, false);
    assert.strictEqual(port.implemented, false);
    await assert.rejects(function () { return port.push({ title: 'nope' }); }, /not configured/i);
    await assert.rejects(function () { return port.putPhoto({ id: 'x' }); }, /not configured/i);
    assert.strictEqual(calls, 0);
    const blob = sync.SUMMARY.join(' ');
    assert.ok(/not connected/i.test(blob));
    assert.ok(!/https?:|localStorage|pin|password/i.test(blob));
  });

  await test('a picture note does not move the page', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.setPhoto(ov, 'day-04', { id: 'pic-1', bytes: 40, type: 'image/jpeg' }, 't');
    const day = P.applyDay(fx.days[3], ov.days['day-04'], fx.season);
    assert.strictEqual(day.displayDate, '2026-12-04');
    assert.strictEqual(day.photo.id, 'pic-1');
    P.setPhoto(ov, 'day-04', null, 't2');
    const cleared = P.applyDay(fx.days[3], ov.days['day-04'], fx.season);
    assert.strictEqual(cleared.photo, null);
    assert.strictEqual(cleared.displayDate, '2026-12-04');
  });

  await test('every chapter picture is open before December', function () {
    const fx = finalized();
    const view = P.buildView(fx, P.blankOverrides(), new Date('2026-11-08T18:00:00Z'));
    assert.strictEqual(view.phase.phase, 'before');
    assert.strictEqual(view.mediaAccess.locked, false);
    assert.strictEqual(view.days.length, 25);
    view.days.forEach(function (d, i) {
      assert.strictEqual(d.scene.available, true);
      assert.strictEqual(d.scene.locked, false);
      assert.strictEqual(d.displayDate, '2026-12-' + String(i + 1).padStart(2, '0'));
      assert.ok(d.title);
    });
    const feature = P.featureStatus(view.days, media.manifest.feature);
    assert.strictEqual(feature.dateLocked, false);
    assert.strictEqual(feature.rendered, false);
    assert.strictEqual(feature.status, 'unavailable');
    assert.strictEqual(feature.stale, false);
  });

  await test('checklist clicks do not count as a chapter change', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.setCheckDone(ov, 'day-02', 'completion', 'step', true, 't');
    P.draftField(ov, 'day-02', 'note', 'still typing', 't');
    assert.strictEqual(ov.contentRevision, 0);
    assert.strictEqual(ov.days['day-02'].contentRevision, 0);
    P.setField(ov, 'day-02', 'props', 'A small bell.', 't2');
    P.setField(ov, 'day-02', 'note', 'Her sentence.', 't3');
    assert.strictEqual(ov.days['day-02'].contentRevision, 2);
    P.setField(ov, 'day-02', 'note', 'Her sentence.', 't4');
    assert.strictEqual(ov.days['day-02'].contentRevision, 2);
    P.setCheckDone(ov, 'day-02', 'prep', 'other', false, 't5');
    assert.strictEqual(ov.days['day-02'].contentRevision, 2);
    assert.ok(ov.listRevision > 0);
    const note = ov.days['day-02'].fields.note.value;
    assert.throws(function () { P.setField(ov, 'day-02', 'note', 'Rewritten', 't6', 'monitor'); }, /cannot change/);
    assert.strictEqual(ov.days['day-02'].fields.note.value, note);
    P.stampReview(ov, 'day-02', 2, 't7', 'monitor');
    assert.strictEqual(ov.days['day-02'].fields.note.value, note);
    assert.strictEqual(ov.days['day-02'].media.lastReviewedRevision, 2);
    const day = P.applyDay(fx.days[1], ov.days['day-02'], fx.season);
    assert.strictEqual(day.scene.needsReview, false);
    assert.strictEqual(day.scene.stale, true);
    P.alignMedia(ov, 'day-02', 2, 't8', 'media');
    const aligned = P.applyDay(fx.days[1], ov.days['day-02'], fx.season);
    assert.strictEqual(aligned.scene.stale, false);
    assert.strictEqual(aligned.note, 'Her sentence.');
    const feature = P.featureStatus([aligned], media.manifest.feature);
    assert.strictEqual(feature.stale, true);
    assert.strictEqual(feature.rendered, false);
    const snap = P.monitorSnapshot(P.buildView(fx, ov, new Date('2026-11-08T18:00:00Z')), media.manifest.feature, 't');
    assert.strictEqual(snap.mayWriteStory, false);
    assert.strictEqual(snap.days[1].note, 'Her sentence.');
    assert.ok(!Object.prototype.hasOwnProperty.call(snap.days[1], 'prepChecks'));
  });

  await test('morning read stays quiet until a real connection', function () {
    const cfg = {
      schemaVersion: 1,
      readiness: 'not-configured',
      endpoint: null,
      access: 'read-only',
      authStorage: 'approved-store-outside-this-file'
    };
    assert.strictEqual(M.validateConfig(cfg).ok, true);
    assert.strictEqual(M.validateConfig(Object.assign({}, cfg, { apiKey: 'nope' })).ok, false);
    let fetches = 0;
    const early = M.runRoutine(new Date('2026-11-08T14:00:00Z'), cfg, { implemented: false, fetch: function () { fetches += 1; } });
    assert.strictEqual(early.reason, 'not-connected');
    assert.strictEqual(early.sent, false);
    assert.strictEqual(early.nextAt, '2026-11-08T15:00:00.000Z');
    assert.strictEqual(fetches, 0);
    const afterNine = M.runRoutine(new Date('2026-11-08T16:00:00Z'), cfg, null);
    assert.strictEqual(afterNine.nextAt, '2026-11-09T15:00:00.000Z');
    assert.strictEqual(M.nextReviewAt(new Date('2026-12-12T14:30:00Z')).toISOString(), '2026-12-12T15:00:00.000Z');
    assert.strictEqual(M.nextReviewAt(new Date('2026-12-25T14:00:00Z')).toISOString(), '2026-12-25T15:00:00.000Z');
    assert.strictEqual(M.nextReviewAt(new Date('2026-12-25T15:00:00Z')), null);
    const ready = Object.assign({}, cfg, { readiness: 'ready', endpoint: 'https://example.invalid/read' });
    const still = M.runRoutine(new Date('2026-11-08T14:00:00Z'), ready, { implemented: false, fetch: function () { fetches += 1; } });
    assert.strictEqual(still.sent, false);
    assert.strictEqual(fetches, 0);
  });

  await test('a private seed replaces the sample and stays off the page source', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    const view = P.buildView(fx, ov, new Date('2026-11-08T18:00:00Z'));
    assert.strictEqual(view.meta.displayName, '');
    assert.strictEqual(view.meta.sampleStory, true);
    const bad = P.importSeed(ov, { elfHqSeed: 1, days: [{ number: 1, title: 'Nope' }], pin: '0000' }, 't', []);
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(ov.meta.sampleStory, true);
    const seed = {
      elfHqSeed: 1,
      containsPrivate: true,
      displayName: 'Storykeeper',
      settings: { houseName: 'The North House' },
      days: [{ number: 1, title: 'Opening night', description: 'A private sentence for this browser only.', note: 'Exact words.' }],
      shopping: [{ name: 'Oranges', needDate: '2026-12-02', state: 'need' }]
    };
    const ok = P.importSeed(ov, seed, 't2', fx.shopping.map(function (item) { return item.id; }));
    assert.strictEqual(ok.ok, true);
    const next = P.buildView(fx, ov, new Date('2026-11-08T18:00:00Z'));
    assert.strictEqual(next.meta.sampleStory, false);
    assert.strictEqual(next.meta.displayName, 'Storykeeper');
    assert.strictEqual(next.meta.houseName, 'The North House');
    assert.strictEqual(P.houseKicker(next.meta), 'The North House');
    assert.strictEqual(P.appTitle(next.meta), 'The North House Elf HQ');
    assert.strictEqual(P.houseKicker({ sampleStory: true, houseName: '' }), 'The Holly House');
    assert.strictEqual(P.houseKicker({ sampleStory: false, houseName: '' }), '');
    assert.strictEqual(P.appTitle({ sampleStory: false, houseName: '' }), 'Elf HQ');
    assert.strictEqual(next.days[0].title, 'Opening night');
    assert.ok(!next.shopping.some(function (item) { return item.id === 'shop-felt'; }));
    assert.ok(next.shopping.some(function (item) { return item.name === 'Oranges'; }));
    assert.strictEqual(next.days[0].displayDate, '2026-12-01');
  });

  await test('notes fold keeps edits once and skips untouched seeds', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.setField(ov, 'day-09', 'props', 'Two single mittens, spoons', 't0');
    P.setField(ov, 'day-09', 'props', 'The red bowl', 't1');
    P.setField(ov, 'day-09', 'description', P.filmLineValue('day-09', 'description'), 't1');
    P.setField(ov, 'day-04', 'arrival', 'Dot', 't1');
    P.setPrepDate(ov, 'day-09', '2026-12-08', 't1');
    const first = P.migrateNotesFold(ov, fx.days, 't2');
    assert.strictEqual(first.ok, true);
    const note = ov.days['day-09'].fields.note.committed;
    assert.ok(note.indexOf('Props: The red bowl') >= 0);
    assert.ok(note.indexOf('Prep date: 2026-12-08') >= 0);
    assert.strictEqual(note.indexOf('What happens:'), -1);
    assert.strictEqual(note.indexOf('Two single mittens'), -1);
    assert.strictEqual(ov.days['day-09'].fields.props.committed, 'The red bowl');
    assert.strictEqual(ov.days['day-09'].prepDate.value, '2026-12-08');
    var day4note = ov.days['day-04'].fields.note;
    assert.ok(!day4note || String(day4note.committed).indexOf('Who arrives:') < 0);
    const again = P.migrateNotesFold(ov, fx.days, 't3');
    assert.strictEqual(again.changes.length, 0);
    assert.strictEqual(ov.days['day-09'].fields.note.committed, note);
    P.setNotesFoldRev(ov, 'day-02', 1);
    P.setField(ov, 'day-02', 'props', 'A private bell', 't4');
    ov.days['day-02'].notesFoldRev = 0;
    ov.days['day-02'].fields.note = { value: 'Already\nProps: A private bell', committed: 'Already\nProps: A private bell', at: 't4' };
    P.migrateNotesFold(ov, fx.days, 't5');
    assert.strictEqual(ov.days['day-02'].fields.note.committed.split('Props: A private bell').length, 2);
  });

  await test('seed notes become film notes and edited notes stay', function () {
    const fx = finalized();
    const ov = P.blankOverrides();
    P.setField(ov, 'day-09', 'note', 'Our own candy note', 't1');
    const first = P.migrateNoteSeeds(ov, fx.days, 't2');
    assert.strictEqual(first.ok, true);
    const changed = first.changes.filter(function (ch) { return ch.field === 'note'; }).map(function (ch) { return ch.id; });
    assert.strictEqual(changed.indexOf('day-09'), -1);
    assert.strictEqual(ov.days['day-09'].fields.note.committed, 'Our own candy note');
    assert.strictEqual(ov.days['day-01'].fields.note.committed, 'Flour on the table. The donut takes the lap.');
    assert.strictEqual(ov.days['day-10'].fields.note.committed, 'A tiny drive-in. Popcorn included.');
    assert.strictEqual(changed.length, 24);
    const again = P.migrateNoteSeeds(ov, fx.days, 't3');
    assert.strictEqual(again.changes.length, 0);
    const plain = P.blankOverrides();
    const all = P.migrateNoteSeeds(plain, fx.days, 't4');
    const days = all.changes.filter(function (ch) { return ch.field === 'note'; }).map(function (ch) { return ch.id; });
    assert.strictEqual(days.length, 25);
    assert.strictEqual(plain.days['day-09'].fields.note.committed, P.filmNoteValue('day-09'));
  });

  await test('rehearsal copy has no prices and no display-date edits', function () {
    const fx = finalized();
    assert.strictEqual(P.hasPriceLanguage(demo.raw), false);
    assert.throws(function () { P.setField(P.blankOverrides(), 'day-01', 'displayDate', '2026-01-01', 't'); });
  });

  if (process.exitCode) {
    console.error('Some tests failed');
    process.exit(process.exitCode);
  }
  console.log('ok ' + passed + ' tests');
})();
