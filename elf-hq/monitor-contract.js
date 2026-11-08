/* Read-only morning look at chapter revisions.
 * The schedule is 9:00 America/Chicago, every day including weekends,
 * through December 25, 2026. Until a private connection is really configured,
 * the routine reports not-connected and does not send anything.
 * Secrets never belong in the config file.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfMonitor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEDULE = {
    timezone: 'America/Chicago',
    localTime: '09:00',
    includeWeekends: true,
    throughDate: '2026-12-25',
    behaviorUntilConnected: 'noop'
  };

  var SECRET_KEYS = /password|secret|token|pepper|authorization|apikey|privatekey|credential|pin/i;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function zoned(date, timeZone) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    var parts = {};
    fmt.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    var hour = Number(parts.hour);
    if (hour === 24) hour = 0;
    return {
      dateKey: parts.year + '-' + parts.month + '-' + parts.day,
      hour: hour,
      minute: Number(parts.minute)
    };
  }

  function addDays(dateKey, days) {
    var bits = dateKey.split('-').map(Number);
    var utc = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2] + days));
    return utc.getUTCFullYear() + '-' + pad(utc.getUTCMonth() + 1) + '-' + pad(utc.getUTCDate());
  }

  function atLocal(dateKey, hour, minute, timeZone) {
    var t = Date.parse(dateKey + 'T' + pad(hour) + ':' + pad(minute) + ':00Z');
    for (var i = 0; i < 4; i++) {
      var got = zoned(new Date(t), timeZone);
      if (got.dateKey === dateKey && got.hour === hour && got.minute === minute) return new Date(t);
      var dayDelta = (Date.parse(dateKey + 'T00:00:00Z') - Date.parse(got.dateKey + 'T00:00:00Z')) / 86400000;
      var minDelta = (hour * 60 + minute) - (got.hour * 60 + got.minute) + dayDelta * 1440;
      t += minDelta * 60000;
    }
    return new Date(t);
  }

  function nextReviewAt(now, schedule) {
    var sched = schedule || SCHEDULE;
    var bits = String(sched.localTime || '09:00').split(':');
    var hour = Number(bits[0]);
    var minute = Number(bits[1] || 0);
    var z = zoned(now, sched.timezone);
    var key = z.dateKey;
    if (z.hour * 60 + z.minute >= hour * 60 + minute) key = addDays(key, 1);
    if (key > sched.throughDate) return null;
    return atLocal(key, hour, minute, sched.timezone);
  }

  function validateConfig(config) {
    var errors = [];
    if (!config || typeof config !== 'object') return { ok: false, errors: ['shape'] };
    function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(function (key) {
        if (SECRET_KEYS.test(key)) errors.push('secret-key');
        var value = obj[key];
        if (typeof value === 'string' && /^(Bearer |sk-|AKIA)/.test(value)) errors.push('secret-value');
        else walk(value);
      });
    }
    walk(config);
    if (config.schemaVersion !== 1) errors.push('version');
    if (config.readiness !== 'not-configured' && config.readiness !== 'ready') errors.push('readiness');
    if (config.access !== 'read-only') errors.push('access');
    if (config.endpoint != null && typeof config.endpoint !== 'string') errors.push('endpoint');
    if (config.readiness === 'ready' && !config.endpoint) errors.push('endpoint-required');
    if (config.secretMaterial != null && config.secretMaterial !== 'absent') errors.push('secret-material');
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, errors: [], readiness: config.readiness };
  }

  function runRoutine(now, config, transport) {
    var next = nextReviewAt(now, SCHEDULE);
    var check = validateConfig(config);
    var connected = !!(check.ok && config && config.readiness === 'ready' && config.endpoint && transport && transport.implemented);
    if (!connected) {
      return {
        ran: false,
        sent: false,
        reason: 'not-connected',
        nextAt: next ? next.toISOString() : null,
        throughDate: SCHEDULE.throughDate
      };
    }
    return { ran: false, sent: false, reason: 'not-connected', nextAt: next ? next.toISOString() : null };
  }

  return {
    SCHEDULE: SCHEDULE,
    validateConfig: validateConfig,
    nextReviewAt: nextReviewAt,
    runRoutine: runRoutine
  };
});
