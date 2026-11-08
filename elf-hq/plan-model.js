/* Elf HQ plan model.
 * Display pages are December 1–25, 2026 in that order (America/Chicago).
 * Prep dates are a separate, editable layer. Suggestions are never deadlines.
 * User edits are an overlay. A fixture or app update must not wipe them.
 * This file does not store anything and does not talk to a network.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TIME_ZONE = 'America/Chicago';
  var SEASON_ID = 'december-2026';
  var SEASON_START = '2026-12-01';
  var DAY_COUNT = 25;
  var FIXTURE_REV = 1;
  var SCHEMA = 1;
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var CONTENT_FIELDS = ['title', 'description', 'note', 'setup', 'props', 'arrival', 'craftNote'];
  var PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  var PHOTO_MAX_BYTES = 900 * 1024;
  var PHOTO_MAX_COUNT = 25;
  var PHOTO_TOTAL_BUDGET = 12 * 1024 * 1024;
  var BACKUP_PHOTO_BUDGET = 8 * 1024 * 1024;
  var SHOP_STATES = ['need', 'owned', 'bought'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function dateKeyInZone(date, timeZone) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    var parts = {};
    fmt.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    return parts.year + '-' + parts.month + '-' + parts.day;
  }

  function hour24(date, timeZone) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23'
    });
    var h = fmt.formatToParts(date).find(function (p) { return p.type === 'hour'; });
    var n = h ? Number(h.value) : 0;
    if (n === 24) n = 0;
    return n;
  }

  function zonedParts(date, timeZone) {
    var tz = timeZone || TIME_ZONE;
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    var parts = {};
    fmt.formatToParts(date).forEach(function (p) { if (p.type !== 'literal') parts[p.type] = p.value; });
    return {
      dateKey: dateKeyInZone(date, tz),
      weekday: parts.weekday,
      month: parts.month,
      day: parts.day,
      year: parts.year,
      hour: hour24(date, tz),
      minute: parts.minute,
      dayPeriod: parts.dayPeriod || '',
      clock: parts.hour + ':' + parts.minute + (parts.dayPeriod ? ' ' + parts.dayPeriod : ''),
      longDate: parts.weekday + ', ' + parts.month + ' ' + parts.day
    };
  }

  function addDays(dateKey, days) {
    var bits = dateKey.split('-').map(Number);
    var utc = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2] + days));
    return utc.getUTCFullYear() + '-' + pad(utc.getUTCMonth() + 1) + '-' + pad(utc.getUTCDate());
  }

  function diffDays(a, b) {
    var ua = Date.parse(a + 'T00:00:00Z');
    var ub = Date.parse(b + 'T00:00:00Z');
    return Math.round((ub - ua) / 86400000);
  }

  function weekdayOfKey(dateKey, timeZone) {
    return zonedParts(new Date(dateKey + 'T12:00:00Z'), timeZone || TIME_ZONE).weekday;
  }

  function formatLong(dateKey, timeZone, withYear) {
    var z = zonedParts(new Date(dateKey + 'T12:00:00Z'), timeZone || TIME_ZONE);
    return z.longDate + (withYear ? ', ' + z.year : '');
  }

  function weekStartKey(dateKey, timeZone) {
    var wd = weekdayOfKey(dateKey, timeZone);
    return addDays(dateKey, -WEEKDAYS.indexOf(wd));
  }

  function displayDateForNumber(number, season) {
    if (number < 1 || number > season.dayCount) return null;
    return addDays(season.startDate, number - 1);
  }

  function seasonPhase(now, season) {
    var z = zonedParts(now, season.timeZone);
    var end = addDays(season.startDate, season.dayCount - 1);
    var phase = 'during';
    if (z.dateKey < season.startDate) phase = 'before';
    else if (z.dateKey > end) phase = 'after';
    return {
      phase: phase,
      todayKey: z.dateKey,
      todayNumber: phase === 'during' ? diffDays(season.startDate, z.dateKey) + 1 : null,
      start: season.startDate,
      end: end,
      zoned: z
    };
  }

  function greeting(hour, name) {
    var part = hour < 5 || hour >= 21 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    var hello = part === 'night' ? 'Good night' : 'Good ' + part;
    var who = String(name || '').trim();
    return who ? hello + ', ' + who + '.' : hello + '.';
  }

  function mentionedWeekdays(text) {
    var found = [];
    var src = String(text || '');
    WEEKDAYS.forEach(function (w) {
      if (new RegExp('\\b' + w + '\\b', 'i').test(src)) found.push(w);
    });
    return found;
  }

  function emptyChecks() {
    return { done: {}, labels: {}, added: [], removed: [] };
  }

  function blankOverrides() {
    return {
      schemaVersion: SCHEMA,
      kind: 'rehearsal-scratchpad',
      containsPrivate: false,
      sync: false,
      fixtureRevSeen: FIXTURE_REV,
      contentRevision: 0,
      listRevision: 0,
      meta: {
        title: null,
        displayName: '',
        soundEnabled: false,
        welcomedAt: null,
        peekDayId: null,
        sampleStory: true
      },
      days: {},
      shopping: { patched: {}, added: [], removed: [] }
    };
  }

  function normalizeOverrides(raw) {
    if (raw == null) return { overrides: blankOverrides(), mode: 'fresh', canWrite: true };
    if (typeof raw !== 'object' || raw.schemaVersion !== SCHEMA || raw.kind !== 'rehearsal-scratchpad') {
      return { overrides: raw, mode: 'readonly-unknown-schema', canWrite: false };
    }
    var privateLocal = !!raw.containsPrivate;
    var meta = raw.meta || {};
    var shopping = raw.shopping || {};
    var overrides = {
      schemaVersion: SCHEMA,
      kind: 'rehearsal-scratchpad',
      containsPrivate: privateLocal,
      sync: false,
      fixtureRevSeen: raw.fixtureRevSeen || FIXTURE_REV,
      contentRevision: Number(raw.contentRevision) || 0,
      listRevision: Number(raw.listRevision) || 0,
      meta: {
        title: meta.title == null ? null : String(meta.title),
        displayName: meta.displayName ? String(meta.displayName) : '',
        soundEnabled: !!meta.soundEnabled,
        welcomedAt: meta.welcomedAt || null,
        peekDayId: meta.peekDayId || null,
        sampleStory: meta.sampleStory !== false
      },
      days: raw.days && typeof raw.days === 'object' ? raw.days : {},
      shopping: {
        patched: shopping.patched || {},
        added: Array.isArray(shopping.added) ? shopping.added : [],
        removed: Array.isArray(shopping.removed) ? shopping.removed : []
      }
    };
    return { overrides: overrides, mode: privateLocal ? 'private-local' : 'ok', canWrite: true };
  }

  function ensureDay(ov, dayId) {
    if (!ov.days[dayId]) {
      ov.days[dayId] = {
        fields: {},
        prep: emptyChecks(),
        completion: emptyChecks()
      };
    }
    var d = ov.days[dayId];
    if (!d.fields) d.fields = {};
    if (!d.prep) d.prep = emptyChecks();
    if (!d.completion) d.completion = emptyChecks();
    if (d.contentRevision == null) d.contentRevision = 0;
    if (!d.contentHistory) d.contentHistory = [];
    if (d.listRevision == null) d.listRevision = 0;
    if (!d.media) d.media = { basedOnRevision: 0, lastReviewedRevision: null, lastReviewedAt: null };
    return d;
  }

  function rejectMonitor(actor) {
    if (actor === 'monitor') {
      var err = new Error('The scene reader cannot change the story.');
      err.code = 'monitor-readonly';
      throw err;
    }
  }

  function bumpList(ov, dayId) {
    ov.listRevision = (Number(ov.listRevision) || 0) + 1;
    if (dayId) ensureDay(ov, dayId).listRevision += 1;
    return ov;
  }

  function bumpContent(ov, day, fields, at, value) {
    day.contentRevision += 1;
    var entry = { rev: day.contentRevision, at: at, fields: fields };
    if (value != null) entry.value = value;
    day.contentHistory.push(entry);
    ov.contentRevision = (Number(ov.contentRevision) || 0) + 1;
    return ov;
  }

  function setField(ov, dayId, field, value, at, actor) {
    rejectMonitor(actor);
    if (CONTENT_FIELDS.indexOf(field) === -1) throw new Error('Field cannot be edited: ' + field);
    var d = ensureDay(ov, dayId);
    var next = String(value);
    var prev = d.fields[field] && d.fields[field].committed != null ? d.fields[field].committed : '';
    d.fields[field] = { value: next, at: at, committed: next };
    if (prev !== next) bumpContent(ov, d, [field], at, next);
    return ov;
  }

  function draftField(ov, dayId, field, value, at, actor) {
    rejectMonitor(actor);
    if (CONTENT_FIELDS.indexOf(field) === -1) throw new Error('Field cannot be edited: ' + field);
    var d = ensureDay(ov, dayId);
    var committed = d.fields[field] ? d.fields[field].committed : undefined;
    d.fields[field] = { value: String(value), at: at, committed: committed };
    return ov;
  }

  function setDone(ov, dayId, done, at, actor) {
    rejectMonitor(actor);
    ensureDay(ov, dayId).done = { value: !!done, at: at };
    return bumpList(ov, dayId);
  }

  function setPhoto(ov, dayId, photo, at, actor) {
    rejectMonitor(actor);
    var d = ensureDay(ov, dayId);
    if (!photo) d.photo = { removed: true, at: at };
    else d.photo = { id: photo.id, bytes: photo.bytes || 0, type: photo.type || '', at: at, removed: false };
    return ov;
  }

  function setPrepDate(ov, dayId, dateKey, at, actor) {
    rejectMonitor(actor);
    var d = ensureDay(ov, dayId);
    var prev = d.prepDate ? d.prepDate.value : '';
    var next = dateKey || '';
    if (!next) delete d.prepDate;
    else d.prepDate = { value: next, at: at };
    if (prev !== next) bumpContent(ov, d, ['prepDate'], at, next);
    return ov;
  }

  function setLeadDays(ov, dayId, days, at, actor) {
    rejectMonitor(actor);
    var d = ensureDay(ov, dayId);
    var prev = d.leadDays ? d.leadDays.value : null;
    if (days == null || days === '') delete d.leadDays;
    else d.leadDays = { value: Number(days), at: at };
    var next = d.leadDays ? d.leadDays.value : null;
    if (prev !== next) bumpContent(ov, d, ['leadDays'], at, next);
    return ov;
  }

  function checkBucket(ov, dayId, listName) {
    if (listName !== 'prep' && listName !== 'completion') throw new Error('Unknown list');
    return ensureDay(ov, dayId)[listName];
  }

  function setCheckDone(ov, dayId, listName, checkId, done, at, actor) {
    rejectMonitor(actor);
    var bucket = checkBucket(ov, dayId, listName);
    bucket.done[checkId] = !!done;
    bucket.touchedAt = at;
    return bumpList(ov, dayId);
  }

  function setCheckLabel(ov, dayId, listName, checkId, label, at, actor) {
    rejectMonitor(actor);
    var bucket = checkBucket(ov, dayId, listName);
    bucket.labels[checkId] = { value: String(label), at: at };
    return bumpList(ov, dayId);
  }

  function addCheck(ov, dayId, listName, label, at, actor) {
    rejectMonitor(actor);
    var bucket = checkBucket(ov, dayId, listName);
    var id = 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    bucket.added.push({ id: id, label: String(label || 'New step'), at: at });
    return { overrides: bumpList(ov, dayId), id: id };
  }

  function removeCheck(ov, dayId, listName, checkId, actor) {
    rejectMonitor(actor);
    var bucket = checkBucket(ov, dayId, listName);
    if (bucket.removed.indexOf(checkId) === -1) bucket.removed.push(checkId);
    return bumpList(ov, dayId);
  }

  function mergeChecks(fixtureItems, ovBucket) {
    var ov = ovBucket || emptyChecks();
    var removed = {};
    (ov.removed || []).forEach(function (id) { removed[id] = true; });
    var labels = ov.labels || {};
    var done = ov.done || {};
    var out = [];
    var seen = {};
    (fixtureItems || []).forEach(function (item) {
      seen[item.id] = true;
      if (removed[item.id]) return;
      out.push({
        id: item.id,
        label: labels[item.id] ? labels[item.id].value : item.label,
        done: !!done[item.id],
        origin: 'fixture',
        orphaned: false
      });
    });
    Object.keys(done).concat(Object.keys(labels)).forEach(function (id) {
      if (seen[id] || removed[id]) return;
      var added = (ov.added || []).some(function (item) { return item.id === id; });
      if (added) return;
      seen[id] = true;
      out.push({
        id: id,
        label: labels[id] ? labels[id].value : 'Saved step',
        done: !!done[id],
        origin: 'kept',
        orphaned: true
      });
    });
    (ov.added || []).forEach(function (item) {
      if (removed[item.id]) return;
      out.push({
        id: item.id,
        label: labels[item.id] ? labels[item.id].value : item.label,
        done: !!done[item.id],
        origin: 'user',
        orphaned: false
      });
    });
    return out;
  }

  function resolvedPrep(displayDate, fixtureDay, ovDay) {
    var suggestion = null;
    if (fixtureDay.suggestedLeadDays != null && fixtureDay.suggestedLeadDays !== '') {
      suggestion = {
        date: addDays(displayDate, -Number(fixtureDay.suggestedLeadDays)),
        leadDays: Number(fixtureDay.suggestedLeadDays),
        reason: fixtureDay.suggestionReason || '',
        confirmed: false
      };
    }
    if (ovDay && ovDay.prepDate && ovDay.prepDate.value) {
      return { date: ovDay.prepDate.value, source: 'date', suggestion: suggestion };
    }
    if (ovDay && ovDay.leadDays && ovDay.leadDays.value != null && ovDay.leadDays.value !== '') {
      var n = Number(ovDay.leadDays.value);
      if (Number.isFinite(n) && n >= 0) {
        return { date: addDays(displayDate, -n), source: 'lead', leadDays: n, suggestion: suggestion };
      }
    }
    return { date: null, source: 'none', suggestion: suggestion };
  }

  function weekdayHint(day) {
    var displayWd = weekdayOfKey(day.displayDate, TIME_ZONE);
    var mentioned = mentionedWeekdays((day.title || '') + ' ' + (day.note || ''));
    var mismatches = mentioned.filter(function (w) { return w !== displayWd; });
    if (!mismatches.length) return null;
    return {
      displayWeekday: displayWd,
      displayDate: day.displayDate,
      mentioned: mismatches,
      moved: false,
      guess: day.suggestionReason || '',
      confirmedDeadline: false
    };
  }

  function applyDay(fixtureDay, ovDay, season) {
    var displayDate = displayDateForNumber(fixtureDay.number, season);
    var fields = (ovDay && ovDay.fields) || {};
    function val(name) {
      if (fields[name] && fields[name].value != null) return fields[name].value;
      return fixtureDay[name] == null ? '' : fixtureDay[name];
    }
    var day = {
      id: fixtureDay.id,
      number: fixtureDay.number,
      displayDate: displayDate,
      weekday: weekdayOfKey(displayDate, season.timeZone),
      title: val('title'),
      description: val('description'),
      note: val('note'),
      setup: val('setup'),
      props: val('props'),
      arrival: val('arrival'),
      craftNote: val('craftNote'),
      contentRevision: (ovDay && ovDay.contentRevision) || 0,
      contentHistory: (ovDay && ovDay.contentHistory) ? ovDay.contentHistory.slice() : [],
      isCraft: !!(fixtureDay.isCraft || (ovDay && (ovDay.prepDate || ovDay.leadDays || (ovDay.fields && ovDay.fields.craftNote)))),
      suggestedLeadDays: fixtureDay.suggestedLeadDays == null ? null : Number(fixtureDay.suggestedLeadDays),
      suggestionReason: fixtureDay.suggestionReason || '',
      done: !!(ovDay && ovDay.done && ovDay.done.value),
      prepChecks: mergeChecks(fixtureDay.prep, ovDay && ovDay.prep),
      completionChecks: mergeChecks(fixtureDay.completion, ovDay && ovDay.completion),
      photo: null
    };
    day.prep = resolvedPrep(displayDate, fixtureDay, ovDay);
    if (ovDay && ovDay.photo && ovDay.photo.id && !ovDay.photo.removed) {
      day.photo = { id: ovDay.photo.id, bytes: ovDay.photo.bytes || 0, type: ovDay.photo.type || '', at: ovDay.photo.at || null };
    }
    day.hint = weekdayHint(day);
    day.edited = {
      title: !!(fields.title),
      description: !!(fields.description),
      note: !!(fields.note),
      setup: !!(fields.setup),
      props: !!(fields.props),
      arrival: !!(fields.arrival),
      craftNote: !!(fields.craftNote),
      prep: !!(ovDay && (ovDay.prepDate || ovDay.leadDays))
    };
    day.scene = chapterScene(ovDay, null);
    return day;
  }

  function applyShopping(fixtureItems, shoppingOv) {
    var ov = shoppingOv || { patched: {}, added: [], removed: [] };
    var removed = {};
    (ov.removed || []).forEach(function (id) { removed[id] = true; });
    var patched = ov.patched || {};
    function withPatch(item) {
      var patch = patched[item.id] || {};
      var next = {
        id: item.id,
        name: patch.name ? patch.name.value : item.name,
        qtyNote: item.qtyNote || '',
        dayId: item.dayId || null,
        needDate: item.needDate || null,
        needBasis: item.needBasis || 'none',
        suggestionNote: item.suggestionNote || '',
        state: patch.state ? patch.state.value : (item.state || 'need'),
        origin: item.origin || 'fixture'
      };
      if (patch.needDate) {
        next.needDate = patch.needDate.value || null;
        next.needBasis = next.needDate ? 'date' : 'none';
        next.suggestionNote = '';
      }
      if (SHOP_STATES.indexOf(next.state) === -1) next.state = 'need';
      return next;
    }
    var out = [];
    (fixtureItems || []).forEach(function (item) {
      if (removed[item.id]) return;
      out.push(withPatch(item));
    });
    (ov.added || []).forEach(function (item) {
      if (removed[item.id]) return;
      out.push(withPatch(Object.assign({ origin: 'user', needBasis: item.needDate ? 'date' : 'none', state: 'need' }, item)));
    });
    return out;
  }

  function shoppingPatch(ov, id) {
    if (!ov.shopping.patched[id]) ov.shopping.patched[id] = {};
    return ov.shopping.patched[id];
  }

  function setShoppingState(ov, id, state, at, actor) {
    rejectMonitor(actor);
    if (SHOP_STATES.indexOf(state) === -1) throw new Error('Unknown shopping state');
    shoppingPatch(ov, id).state = { value: state, at: at };
    return bumpList(ov);
  }

  function setShoppingName(ov, id, name, at, actor) {
    rejectMonitor(actor);
    shoppingPatch(ov, id).name = { value: String(name), at: at };
    return bumpList(ov);
  }

  function setShoppingNeedDate(ov, id, dateKey, at, actor) {
    rejectMonitor(actor);
    shoppingPatch(ov, id).needDate = { value: dateKey || '', at: at };
    return bumpList(ov);
  }

  function addShopping(ov, item, at, actor) {
    rejectMonitor(actor);
    var id = item.id || ('shop-user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6));
    ov.shopping.added.push({
      id: id,
      name: String(item.name || 'Something for the trip'),
      qtyNote: String(item.qtyNote || ''),
      dayId: item.dayId || null,
      needDate: item.needDate || null,
      needBasis: item.needDate ? 'date' : 'none',
      suggestionNote: '',
      state: 'need',
      origin: 'user',
      at: at
    });
    bumpList(ov);
    return id;
  }

  function removeShopping(ov, id, actor) {
    rejectMonitor(actor);
    if (ov.shopping.removed.indexOf(id) === -1) ov.shopping.removed.push(id);
    return bumpList(ov);
  }

  function setMeta(ov, key, value) {
    if (key === 'peekDayId') {
      ov.meta.peekDayId = value || null;
      return ov;
    }
    if (key === 'welcomedAt') {
      ov.meta.welcomedAt = value;
      return ov;
    }
    if (key === 'displayName') ov.meta.displayName = String(value || '').slice(0, 40);
    else if (key === 'title') ov.meta.title = value ? String(value).slice(0, 40) : null;
    else if (key === 'soundEnabled') ov.meta.soundEnabled = !!value;
    else throw new Error('Unknown meta');
    return ov;
  }

  function chapterScene(ovDay, entry) {
    var rev = (ovDay && ovDay.contentRevision) || 0;
    var media = (ovDay && ovDay.media) || { basedOnRevision: 0, lastReviewedRevision: null, lastReviewedAt: null };
    var based = Number(media.basedOnRevision) || 0;
    var reviewed = media.lastReviewedRevision == null ? null : media.lastReviewedRevision;
    return {
      available: true,
      locked: false,
      filmed: !!(entry && entry.status === 'ready' && entry.src),
      slotStatus: (entry && entry.status) || 'awaiting-film',
      contentRevision: rev,
      basedOnRevision: based,
      lastReviewedRevision: reviewed,
      lastReviewedAt: media.lastReviewedAt || null,
      stale: rev > based,
      needsReview: reviewed == null ? rev > 0 : rev > reviewed
    };
  }

  function mediaAccess() {
    return {
      available: true,
      locked: false,
      reason: 'The calendar chooses where the book opens. It does not hide chapters or pictures.'
    };
  }

  function stampReview(ov, dayId, rev, at, actor) {
    if (actor !== 'monitor') throw new Error('Only the scene reader can mark a chapter as looked at.');
    var d = ensureDay(ov, dayId);
    if ((d.contentRevision || 0) !== rev) {
      var err = new Error('That look does not match the chapter. Nothing was changed.');
      err.code = 'review-mismatch';
      throw err;
    }
    d.media.lastReviewedRevision = rev;
    d.media.lastReviewedAt = at;
    return ov;
  }

  function alignMedia(ov, dayId, rev, at, actor) {
    if (actor !== 'media') throw new Error('Only a new picture can be marked as caught up.');
    var d = ensureDay(ov, dayId);
    if ((d.contentRevision || 0) !== rev) throw new Error('The picture must name the current chapter revision.');
    var note = d.fields.note && d.fields.note.value;
    d.media.basedOnRevision = rev;
    d.media.alignedAt = at;
    if (d.fields.note && d.fields.note.value !== note) d.fields.note.value = note;
    return ov;
  }

  function buildView(fixture, ov, now) {
    var days = fixture.days.map(function (d) { return applyDay(d, ov.days[d.id], fixture.season); });
    var shopping = applyShopping(fixture.shopping, ov.shopping);
    var phase = seasonPhase(now, fixture.season);
    var peek = ov.meta.peekDayId ? days.find(function (d) { return d.id === ov.meta.peekDayId; }) : null;
    var shown;
    if (peek) shown = { day: peek, mode: 'peek' };
    else if (phase.phase === 'during') shown = { day: days[phase.todayNumber - 1], mode: 'today' };
    else if (phase.phase === 'before') shown = { day: days[0], mode: 'upcoming' };
    else shown = { day: days[days.length - 1], mode: 'archive' };
    return {
      season: fixture.season,
      defaultTitle: fixture.defaultTitle,
      meta: {
        title: ov.meta.title || fixture.defaultTitle,
        displayName: ov.meta.displayName || (ov.meta.sampleStory !== false && fixture.demoName ? fixture.demoName : ''),
        soundEnabled: !!ov.meta.soundEnabled,
        welcomedAt: ov.meta.welcomedAt,
        peekDayId: ov.meta.peekDayId || null,
        sampleStory: ov.meta.sampleStory !== false
      },
      contentRevision: ov.contentRevision,
      days: days,
      shopping: shopping,
      phase: phase,
      shown: shown,
      mediaAccess: mediaAccess()
    };
  }

  function groupShopping(items, todayKey, timeZone) {
    var tz = timeZone || TIME_ZONE;
    var groups = new Map();
    function add(key, label, tone, item) {
      if (!groups.has(key)) groups.set(key, { key: key, label: label, tone: tone, items: [] });
      groups.get(key).items.push(item);
    }
    var thisWeek = weekStartKey(todayKey, tz);
    items.forEach(function (item) {
      if (item.needBasis === 'suggestion') {
        var sugKey = item.needDate ? weekStartKey(item.needDate, tz) : 'open';
        var sugLabel = sugKey === 'open'
          ? 'Suggested, not a confirmed need date'
          : 'Suggested around the week of ' + formatLong(sugKey, tz, false) + ' — not a deadline';
        add('suggestion:' + sugKey, sugLabel, 'suggestion', item);
        return;
      }
      if (!item.needDate || item.needBasis === 'none') {
        add('undated', 'No need date yet', 'undated', item);
        return;
      }
      var wk = weekStartKey(item.needDate, tz);
      var tone = wk === thisWeek ? 'this' : wk < thisWeek ? 'past' : 'upcoming';
      var label = (tone === 'this' ? 'This week · ' : tone === 'past' ? 'Earlier · ' : 'Coming up · ') + 'week of ' + formatLong(wk, tz, false);
      add('week:' + wk, label, tone, item);
    });
    var order = { this: 0, upcoming: 1, past: 2, suggestion: 3, undated: 4 };
    return Array.from(groups.values()).sort(function (a, b) {
      if (order[a.tone] !== order[b.tone]) return order[a.tone] - order[b.tone];
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
  }

  function shoppingPlainText(groups) {
    var lines = [
      'Elf HQ rehearsal list',
      'Walmart, Bastrop — with the regular weekly grocery money.',
      'No prices are kept here.',
      ''
    ];
    groups.forEach(function (g) {
      lines.push(g.label);
      g.items.forEach(function (item) {
        var state = item.state === 'owned' ? 'owned' : item.state === 'bought' ? 'bought' : 'need';
        lines.push(' - [' + state + '] ' + item.name + (item.qtyNote ? ' (' + item.qtyNote + ')' : ''));
      });
      lines.push('');
    });
    return lines.join('\n').trim() + '\n';
  }

  function craftEntries(days) {
    return days.filter(function (d) {
      return d.isCraft || d.prep.source !== 'none' || (d.prep.suggestion && d.prep.suggestion.date);
    }).slice().sort(function (a, b) {
      var ak = a.prep.date || (a.prep.suggestion && a.prep.suggestion.date) || a.displayDate;
      var bk = b.prep.date || (b.prep.suggestion && b.prep.suggestion.date) || b.displayDate;
      if (ak !== bk) return ak < bk ? -1 : 1;
      return a.number - b.number;
    });
  }

  function checkPhotoAdd(existing, incoming) {
    if (!incoming || PHOTO_TYPES.indexOf(incoming.type) === -1) return { ok: false, code: 'type' };
    if (!(incoming.bytes > 0) || incoming.bytes > PHOTO_MAX_BYTES) return { ok: false, code: 'too-big' };
    var others = (existing || []).filter(function (p) { return p.dayId !== incoming.dayId; });
    if (others.length + 1 > PHOTO_MAX_COUNT) return { ok: false, code: 'count' };
    var total = others.reduce(function (s, p) { return s + (p.bytes || 0); }, 0) + incoming.bytes;
    if (total > PHOTO_TOTAL_BUDGET) return { ok: false, code: 'budget' };
    return { ok: true };
  }

  function photoError(code) {
    if (code === 'type') return 'That file is not a JPEG, PNG, or WebP. Nothing was replaced.';
    if (code === 'too-big') return 'That picture is still over 900 KB after shrinking. It was not saved. The previous picture is unchanged.';
    if (code === 'count') return 'This notebook already has 25 pictures. Remove one before adding another. Nothing was replaced.';
    if (code === 'budget') return 'These pictures would pass the 12 MB rehearsal ceiling. This one was not saved.';
    if (code === 'quota') return 'The browser refused to store more. This picture was not saved, and the ones already here were not deleted.';
    if (code === 'decode') return 'That picture could not be read. Nothing was changed.';
    return 'The picture was not saved. Nothing already stored was deleted.';
  }

  function buildBackup(overrides, photos, mode, exportedAt) {
    if (!overrides) return { ok: false, code: 'invalid' };
    var list = photos || [];
    var base = {
      elfHqBackup: 1,
      kind: 'rehearsal-scratchpad',
      containsPrivate: !!overrides.containsPrivate,
      exportedAt: exportedAt || null,
      photosIncluded: false,
      photoIdsOmitted: list.map(function (p) { return p.id; }),
      notice: 'Rehearsal notebook from one browser. Not a shared copy. Do not commit this file to the public site.',
      overrides: overrides
    };
    if (mode !== 'photos') return { ok: true, backup: base };
    if (!list.length) return { ok: false, code: 'no-photos' };
    var bytes = list.reduce(function (s, p) { return s + (p.bytes || 0); }, 0);
    if (bytes > BACKUP_PHOTO_BUDGET) {
      return { ok: false, code: 'too-big', photoIds: list.map(function (p) { return p.id; }) };
    }
    return {
      ok: true,
      backup: Object.assign({}, base, { photosIncluded: true, photoIdsOmitted: [], photos: list })
    };
  }

  function parseBackup(data) {
    if (!data || typeof data !== 'object') return { ok: false, code: 'invalid' };
    if (data.elfHqBackup !== 1) return { ok: false, code: 'version' };
    if (data.kind !== 'rehearsal-scratchpad') return { ok: false, code: 'kind' };
    var norm = normalizeOverrides(data.overrides);
    if (!norm.canWrite) return { ok: false, code: 'schema' };
    return { ok: true, overrides: norm.overrides, photos: data.photosIncluded ? (data.photos || []) : [] };
  }

  function threeWay(base, local, server) {
    var b = base ? base.rev : 0;
    var lr = local ? local.rev : b;
    var sr = server ? server.rev : b;
    var lv = local ? local.value : (base ? base.value : undefined);
    var sv = server ? server.value : (base ? base.value : undefined);
    if (lv === sv) return { ok: true, value: lv, rev: Math.max(lr, sr) };
    if (lr === b && sr !== b) return { ok: true, value: sv, rev: sr };
    if (sr === b && lr !== b) return { ok: true, value: lv, rev: lr };
    if (lr !== b && sr !== b) return { ok: false, conflict: { local: lv, server: sv, localRev: lr, serverRev: sr } };
    return { ok: true, value: lv, rev: lr };
  }

  function mergeDocuments(base, local, server, fields) {
    var conflicts = [];
    var merged = {};
    fields.forEach(function (f) {
      var result = threeWay(base ? base[f] : null, local ? local[f] : null, server ? server[f] : null);
      if (!result.ok) conflicts.push(Object.assign({ field: f }, result.conflict));
      else merged[f] = { value: result.value, rev: result.rev };
    });
    return { ok: conflicts.length === 0, merged: merged, conflicts: conflicts };
  }

  function toSyncDocument(view) {
    return {
      schemaVersion: SCHEMA,
      seasonId: view.season.id,
      contentRevision: view.contentRevision,
      title: view.meta.title,
      displayName: view.meta.displayName,
      soundEnabled: view.meta.soundEnabled,
      days: view.days.map(function (d) {
        return {
          id: d.id,
          number: d.number,
          displayDate: d.displayDate,
          title: d.title,
          description: d.description,
          note: d.note,
          done: d.done,
          prepDate: d.prep.date,
          prepSource: d.prep.source,
          photoId: d.photo ? d.photo.id : null,
          prep: d.prepChecks.map(function (c) { return { id: c.id, label: c.label, done: c.done }; }),
          completion: d.completionChecks.map(function (c) { return { id: c.id, label: c.label, done: c.done }; })
        };
      }),
      shopping: view.shopping.map(function (s) {
        return { id: s.id, name: s.name, state: s.state, needDate: s.needDate, needBasis: s.needBasis };
      })
    };
  }

  function planFeaturePlayback(entry, ctx) {
    var ready = !!(entry && entry.status === 'ready' && entry.rendered === true && entry.src && ctx && ctx.authedBlob);
    var base = {
      kind: 'feature',
      muted: true,
      playsinline: true,
      preload: 'none',
      controls: true,
      captions: true,
      autoplay: false,
      mountsVideo: false,
      playFromGesture: false,
      showPlayButton: false,
      placeholder: true,
      unavailable: true,
      hidden: false,
      locked: false,
      dateLocked: false,
      poster: false
    };
    if (!entry || entry.kind !== 'feature') return base;
    if (!ready) return base;
    if (!ctx.visible) return Object.assign({}, base, { placeholder: false, unavailable: false, hidden: true });
    if (!ctx.userAskedPlay) {
      return Object.assign({}, base, {
        placeholder: false,
        unavailable: false,
        poster: true,
        showPlayButton: true,
        mountsVideo: false,
        autoplay: false,
        preload: 'none'
      });
    }
    return Object.assign({}, base, {
      placeholder: false,
      unavailable: false,
      mountsVideo: true,
      autoplay: false,
      playFromGesture: true,
      showPlayButton: true,
      controls: true,
      preload: 'none',
      captions: !!entry.captions
    });
  }

  function planPlayback(entry, ctx) {
    if (entry && entry.kind === 'feature') return planFeaturePlayback(entry, ctx);
    var hold = !!(ctx && (ctx.reducedMotion || ctx.saveData));
    var visible = !!(ctx && ctx.visible);
    var asked = !!(ctx && ctx.userAskedPlay);
    var base = {
      muted: true,
      playsinline: true,
      preload: 'none',
      mountsVideo: false,
      autoplay: false,
      playFromGesture: false,
      showPlayButton: false,
      placeholder: true,
      hidden: false
    };
    if (!entry || entry.status !== 'ready' || !entry.src) return base;
    if (!visible) return Object.assign({}, base, { placeholder: false, hidden: true });
    if (hold && !asked) {
      return Object.assign({}, base, { placeholder: false, showPlayButton: true, posterHold: true });
    }
    if (hold && asked) {
      return Object.assign({}, base, { placeholder: false, mountsVideo: true, playFromGesture: true, showPlayButton: true });
    }
    return Object.assign({}, base, { placeholder: false, mountsVideo: true, autoplay: true });
  }

  function auditManifest(manifest) {
    var errors = [];
    if (!manifest || !manifest.encoding || !Array.isArray(manifest.days)) errors.push('shape');
    var days = (manifest && manifest.days) || [];
    if (days.length !== DAY_COUNT) errors.push('count');
    var ids = {};
    var gags = {};
    days.forEach(function (e) {
      if (!e || !e.dayId) { errors.push('id'); return; }
      if (ids[e.dayId]) errors.push('dup-id:' + e.dayId);
      ids[e.dayId] = true;
      if (e.status !== 'awaiting-film') errors.push('status:' + e.dayId);
      if (e.src || e.poster || e.src480) errors.push('src:' + e.dayId);
      if (e.filmed) errors.push('filmed:' + e.dayId);
      if (!e.gagToFilm || gags[e.gagToFilm]) errors.push('gag:' + e.dayId);
      gags[e.gagToFilm] = true;
      if (!e.placeholder || !e.placeholder.caption) errors.push('caption:' + e.dayId);
    });
    var enc = manifest && manifest.encoding;
    if (enc) {
      if (enc.videoCodec !== 'avc1' || enc.container !== 'mp4') errors.push('codec');
      if (enc.width !== 720 || enc.height !== 1280 || enc.fps !== 24) errors.push('frame');
      if (enc.audio !== 'none' || enc.fastStart !== true || enc.mutedFile !== true) errors.push('audio');
      if (enc.durationSecMin !== 5 || enc.durationSecMax !== 6) errors.push('duration');
      if (!enc.optionalSmaller || enc.optionalSmaller.width !== 480) errors.push('480');
    }
    var dir = manifest && manifest.direction;
    if (!dir || dir.characterChosen !== false) errors.push('character');
    var feature = manifest && manifest.feature;
    if (!feature || feature.kind !== 'feature' || feature.id !== 'whole-story') errors.push('feature');
    else {
      if (feature.status !== 'unavailable') errors.push('feature-status');
      if (feature.rendered !== false || feature.filmed !== false) errors.push('feature-rendered');
      if (feature.src || feature.poster || feature.captions || feature.phoneSrc) errors.push('feature-src');
      if (feature.runtimeLocked !== false || feature.dateLock !== false) errors.push('feature-lock');
      if (!feature.playback || feature.playback.autoplay !== false || feature.playback.preload !== 'none' || feature.playback.controls !== true) errors.push('feature-playback');
      if (feature.access !== 'authenticated-private') errors.push('feature-access');
      days.forEach(function (d) { if (d.dayId === feature.id) errors.push('feature-collides'); });
    }
    return errors;
  }

  function featureStatus(days, feature) {
    var storyRevision = 0;
    (days || []).forEach(function (d) {
      if ((d.contentRevision || 0) > storyRevision) storyRevision = d.contentRevision;
    });
    var based = feature && feature.basedOnRevision != null ? Number(feature.basedOnRevision) : 0;
    return {
      id: 'whole-story',
      available: true,
      locked: false,
      dateLocked: false,
      status: (feature && feature.status) || 'unavailable',
      rendered: !!(feature && feature.rendered === true && feature.src),
      filmed: !!(feature && feature.filmed === true && feature.src),
      storyRevision: storyRevision,
      basedOnRevision: based,
      stale: storyRevision > based,
      playback: planFeaturePlayback(feature || { kind: 'feature' }, { visible: true, userAskedPlay: false })
    };
  }

  function monitorSnapshot(view, feature, exportedAt) {
    return {
      schema: 'elf-hq.monitor-snapshot',
      schemaVersion: 1,
      access: 'read-only',
      mayWriteStory: false,
      exportedAt: exportedAt || null,
      seasonId: view.season.id,
      days: view.days.map(function (d) {
        return {
          id: d.id,
          number: d.number,
          displayDate: d.displayDate,
          contentRevision: d.contentRevision,
          history: d.contentHistory,
          title: d.title,
          description: d.description,
          note: d.note,
          setup: d.setup,
          props: d.props,
          arrival: d.arrival,
          craftNote: d.craftNote,
          prepDate: d.prep.date,
          prepSource: d.prep.source,
          scene: d.scene
        };
      }),
      feature: featureStatus(view.days, feature)
    };
  }

  function hasPriceLanguage(value) {
    var text = JSON.stringify(value);
    return /\$|\bprice\b|\bcost\b|\bbudget\b/i.test(text);
  }

  function deepFreeze(obj) {
    if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    Object.keys(obj).forEach(function (k) { deepFreeze(obj[k]); });
    return Object.freeze(obj);
  }

  function dayId(number) { return 'day-' + pad(number); }

  function finalizeFixture(raw) {
    var errors = [];
    if (!raw || !raw.season || raw.season.startDate !== SEASON_START || raw.season.dayCount !== DAY_COUNT) errors.push('season');
    if (!raw || !raw.days || raw.days.length !== DAY_COUNT) errors.push('days');
    var days = (raw && raw.days) || [];
    days.forEach(function (d, i) {
      var n = i + 1;
      if (!d || d.number !== n || d.id !== dayId(n)) errors.push('order:' + n);
      var display = displayDateForNumber(n, raw.season);
      if (display !== SEASON_START.slice(0, 8) + pad(n)) errors.push('date:' + n);
    });
    (raw && raw.shopping || []).forEach(function (item) {
      if (item.dayId && !days.some(function (d) { return d.id === item.dayId; })) errors.push('shop-day:' + item.id);
      if (SHOP_STATES.indexOf(item.state) === -1) errors.push('shop-state:' + item.id);
    });
    if (hasPriceLanguage(raw)) errors.push('price-language');
    if (errors.length) return { ok: false, errors: errors };
    return {
      ok: true,
      errors: [],
      fixture: deepFreeze({
        fixtureRev: FIXTURE_REV,
        defaultTitle: raw.defaultTitle || 'Elf HQ',
        demoName: raw.demoName || '',
        recipients: raw.recipients || [],
        season: {
          id: SEASON_ID,
          label: 'December 1–25, 2026',
          timeZone: TIME_ZONE,
          startDate: SEASON_START,
          dayCount: DAY_COUNT
        },
        days: days,
        shopping: raw.shopping || []
      })
    };
  }

  function hasSecretKey(obj) {
    if (!obj || typeof obj !== 'object') return false;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      if (/^(pin|password|secret|token|apikey|datakey|pepper)$/i.test(keys[i])) return true;
      if (hasSecretKey(obj[keys[i]])) return true;
    }
    return false;
  }

  function importSeed(ov, seed, at, hideShoppingIds) {
    if (!seed || seed.elfHqSeed !== 1 || !Array.isArray(seed.days)) return { ok: false, code: 'invalid' };
    if (hasSecretKey(seed)) return { ok: false, code: 'secret' };
    ov.meta.sampleStory = false;
    ov.containsPrivate = seed.containsPrivate !== false;
    if (seed.displayName) ov.meta.displayName = String(seed.displayName).slice(0, 40);
    if (seed.title) ov.meta.title = String(seed.title).slice(0, 40);
    seed.days.forEach(function (day) {
      if (!day || !day.number) return;
      var id = dayId(day.number);
      var bucket = ensureDay(ov, id);
      var touched = false;
      CONTENT_FIELDS.forEach(function (field) {
        if (day[field] == null) return;
        var next = String(day[field]);
        bucket.fields[field] = { value: next, at: at, committed: next };
        touched = true;
      });
      if (day.prepDate) bucket.prepDate = { value: day.prepDate, at: at };
      if (Array.isArray(day.prep)) {
        bucket.prep.added = day.prep.map(function (label, i) {
          return { id: id + '-seed-p-' + (i + 1), label: String(label), at: at };
        });
      }
      if (Array.isArray(day.completion)) {
        bucket.completion.added = day.completion.map(function (label, i) {
          return { id: id + '-seed-c-' + (i + 1), label: String(label), at: at };
        });
      }
      if (touched) {
        bucket.contentRevision = (bucket.contentRevision || 0) + 1;
        bucket.contentHistory.push({ rev: bucket.contentRevision, at: at, fields: ['imported'] });
        ov.contentRevision = (Number(ov.contentRevision) || 0) + 1;
      }
    });
    ov.shopping.removed = (hideShoppingIds || []).slice();
    ov.shopping.patched = {};
    ov.shopping.added = (seed.shopping || []).map(function (item, i) {
      return {
        id: 'seed-shop-' + (i + 1),
        name: String(item.name || 'Something for the trip'),
        qtyNote: String(item.qtyNote || ''),
        dayId: null,
        needDate: item.needDate || null,
        needBasis: item.needDate ? 'date' : 'none',
        suggestionNote: '',
        state: SHOP_STATES.indexOf(item.state) === -1 ? 'need' : item.state,
        origin: 'user',
        at: at
      };
    });
    return { ok: true };
  }

  function loosePhotos(overrides, metas) {
    var referenced = {};
    var days = (overrides && overrides.days) || {};
    Object.keys(days).forEach(function (dayIdKey) {
      var photo = days[dayIdKey].photo;
      if (photo && photo.id && !photo.removed) referenced[photo.id] = true;
    });
    return (metas || []).filter(function (m) { return m && m.id && !referenced[m.id]; });
  }

  return {
    TIME_ZONE: TIME_ZONE,
    SEASON_START: SEASON_START,
    DAY_COUNT: DAY_COUNT,
    FIXTURE_REV: FIXTURE_REV,
    SCHEMA: SCHEMA,
    PHOTO_MAX_BYTES: PHOTO_MAX_BYTES,
    PHOTO_MAX_COUNT: PHOTO_MAX_COUNT,
    PHOTO_TOTAL_BUDGET: PHOTO_TOTAL_BUDGET,
    BACKUP_PHOTO_BUDGET: BACKUP_PHOTO_BUDGET,
    PHOTO_TYPES: PHOTO_TYPES,
    SHOP_STATES: SHOP_STATES,
    dateKeyInZone: dateKeyInZone,
    hour24: hour24,
    zonedParts: zonedParts,
    addDays: addDays,
    diffDays: diffDays,
    weekdayOfKey: weekdayOfKey,
    formatLong: formatLong,
    weekStartKey: weekStartKey,
    displayDateForNumber: displayDateForNumber,
    seasonPhase: seasonPhase,
    greeting: greeting,
    mentionedWeekdays: mentionedWeekdays,
    blankOverrides: blankOverrides,
    normalizeOverrides: normalizeOverrides,
    setField: setField,
    draftField: draftField,
    chapterScene: chapterScene,
    mediaAccess: mediaAccess,
    stampReview: stampReview,
    alignMedia: alignMedia,
    featureStatus: featureStatus,
    monitorSnapshot: monitorSnapshot,
    planFeaturePlayback: planFeaturePlayback,
    setDone: setDone,
    setPhoto: setPhoto,
    setPrepDate: setPrepDate,
    setLeadDays: setLeadDays,
    setCheckDone: setCheckDone,
    setCheckLabel: setCheckLabel,
    addCheck: addCheck,
    removeCheck: removeCheck,
    mergeChecks: mergeChecks,
    resolvedPrep: resolvedPrep,
    applyDay: applyDay,
    applyShopping: applyShopping,
    setShoppingState: setShoppingState,
    setShoppingName: setShoppingName,
    setShoppingNeedDate: setShoppingNeedDate,
    addShopping: addShopping,
    removeShopping: removeShopping,
    setMeta: setMeta,
    buildView: buildView,
    groupShopping: groupShopping,
    shoppingPlainText: shoppingPlainText,
    craftEntries: craftEntries,
    checkPhotoAdd: checkPhotoAdd,
    photoError: photoError,
    buildBackup: buildBackup,
    parseBackup: parseBackup,
    threeWay: threeWay,
    mergeDocuments: mergeDocuments,
    toSyncDocument: toSyncDocument,
    planPlayback: planPlayback,
    auditManifest: auditManifest,
    hasPriceLanguage: hasPriceLanguage,
    finalizeFixture: finalizeFixture,
    loosePhotos: loosePhotos,
    importSeed: importSeed,
    dayId: dayId,
    weekdayHint: weekdayHint
  };
});
