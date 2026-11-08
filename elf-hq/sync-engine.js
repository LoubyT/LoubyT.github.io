/* Revisioned shared edits.
 * The household server route is not deployed. An unconfigured session stays
 * disconnected and never says saved-to-the-other-phone.
 * createSimServer is an in-memory test double. It is not fd-refresh-relay.
 * Phones talk only through push/pull. No shared browser storage.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfLive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  function createSimServer() {
    var revision = 0;
    var fields = {};
    var seen = {};
    return {
      kind: 'simulated-test-server',
      deployed: false,
      pull: function (since) {
        var changes = [];
        Object.keys(fields).forEach(function (path) {
          if (fields[path].rev > since) {
            changes.push({ path: path, value: clone(fields[path].value), rev: fields[path].rev, deleted: !!fields[path].deleted });
          }
        });
        return Promise.resolve({ revision: revision, changes: changes });
      },
      push: function (op) {
        if (seen[op.id]) return Promise.resolve(clone(seen[op.id]));
        var applied = [];
        var conflicts = [];
        (op.changes || []).forEach(function (ch) {
          var cur = fields[ch.path];
          var curRev = cur ? cur.rev : 0;
          var same = cur && JSON.stringify(cur.value) === JSON.stringify(ch.value) && !!cur.deleted === !!ch.deleted;
          if (curRev !== (ch.baseRev || 0) && !same) {
            conflicts.push({
              path: ch.path,
              local: clone(ch.value),
              server: cur ? clone(cur.value) : undefined,
              serverDeleted: !!(cur && cur.deleted),
              serverRev: curRev
            });
            return;
          }
          revision += 1;
          fields[ch.path] = { value: clone(ch.value), rev: revision, deleted: !!ch.deleted };
          applied.push({ path: ch.path, rev: revision });
        });
        var res = { revision: revision, applied: applied, conflicts: conflicts };
        seen[op.id] = clone(res);
        return Promise.resolve(res);
      }
    };
  }

  function createSession(opts) {
    opts = opts || {};
    var server = opts.server || null;
    var pollMs = opts.pollMs == null ? 2000 : opts.pollMs;
    var fields = {};
    var drafts = {};
    var held = {};
    var queue = [];
    var conflicts = [];
    var since = 0;
    var status = server ? 'saved' : 'disconnected';
    var hidden = false;
    var timer = null;
    var stopped = false;
    var pushing = false;
    var seq = 0;
    var sessionId = Math.random().toString(36).slice(2, 10);
    var listeners = [];
    var fetches = 0;

    function emit() { listeners.forEach(function (fn) { fn(view()); }); }

    function view() {
      var visible = {};
      Object.keys(fields).forEach(function (path) {
        if (fields[path].deleted) return;
        visible[path] = clone(fields[path].value);
      });
      Object.keys(drafts).forEach(function (path) { visible[path] = clone(drafts[path]); });
      return {
        state: status,
        deployed: !!(server && server.deployed),
        serverKind: server ? server.kind : 'none',
        connected: !!(server && server.deployed),
        fields: visible,
        conflicts: conflicts.slice(),
        unsent: queue.length,
        asleep: hidden
      };
    }

    function knownRev(path) { return fields[path] ? fields[path].rev : 0; }

    function applyRemote(ch) {
      if (drafts[ch.path] != null) {
        held[ch.path] = ch;
        return;
      }
      if (ch.deleted) fields[ch.path] = { value: ch.value, rev: ch.rev, deleted: true };
      else fields[ch.path] = { value: clone(ch.value), rev: ch.rev, deleted: false };
      if (ch.rev > since) since = ch.rev;
    }

    function pull() {
      if (!server) { status = 'disconnected'; emit(); return Promise.resolve(view()); }
      if (server.fail) { status = hidden ? 'disconnected' : 'reconnecting'; emit(); return Promise.reject(new Error('offline')); }
      fetches += 1;
      return server.pull(since).then(function (res) {
        if (res && res.unchanged) {
          if (!queue.length && !conflicts.length) status = 'saved';
          emit();
          return view();
        }
        (res.changes || []).forEach(function (ch) {
          if (conflicts.some(function (c) { return c.path === ch.path; })) return;
          if (queue.some(function (op) { return op.changes.some(function (c) { return c.path === ch.path; }); })) return;
          applyRemote(ch);
        });
        if (res.revision > since) since = res.revision;
        if (!queue.length && !conflicts.length) status = 'saved';
        emit();
        return view();
      }, function (err) {
        status = 'reconnecting';
        emit();
        throw err;
      });
    }

    function pump() {
      if (!server) return Promise.resolve();
      if (pushing) return Promise.resolve();
      if (!queue.length) return hidden ? Promise.resolve() : pull();
      pushing = true;
      status = 'saving';
      emit();
      var op = queue[0];
      var send = server.fail ? Promise.reject(new Error('offline')) : server.push(op);
      return send.then(function (res) {
        queue.shift();
        (res.applied || []).forEach(function (item) {
          if (fields[item.path]) fields[item.path].rev = item.rev;
        });
        (res.conflicts || []).forEach(function (c) { conflicts.push(c); });
        pushing = false;
        status = conflicts.length ? 'conflict' : (queue.length ? 'saving' : 'saved');
        emit();
        return queue.length ? pump() : pull();
      }, function () {
        pushing = false;
        status = 'offline';
        emit();
      });
    }

    function enqueue(path, value, deleted) {
      var op = {
        id: sessionId + '-' + (++seq) + '-' + path,
        changes: [{ path: path, value: clone(value), baseRev: knownRev(path), deleted: !!deleted }]
      };
      queue.push(op);
      if (!server) { status = 'disconnected'; emit(); return Promise.resolve(view()); }
      return pump();
    }

    function loop() {
      if (stopped || hidden || !server || !pollMs) return;
      pump().then(function () { if (!stopped && !hidden && server) timer = setTimeout(loop, pollMs); }, function () {
        status = 'reconnecting';
        emit();
        if (!stopped && !hidden && server) timer = setTimeout(loop, pollMs);
      });
    }

    return {
      view: view,
      fetches: function () { return fetches; },
      get: function (path) { return view().fields[path]; },
      focus: function (path) { drafts[path] = fields[path] && !fields[path].deleted ? clone(fields[path].value) : ''; },
      draft: function (path, value) { drafts[path] = value; emit(); },
      commit: function (path, value) {
        delete drafts[path];
        delete held[path];
        fields[path] = { value: clone(value), rev: knownRev(path), deleted: false };
        return enqueue(path, value, false);
      },
      remove: function (path) {
        delete drafts[path];
        fields[path] = { value: fields[path] ? fields[path].value : null, rev: knownRev(path), deleted: true };
        return enqueue(path, fields[path].value, true);
      },
      blur: function (path) {
        if (drafts[path] == null) {
          if (held[path]) { applyRemote(held[path]); delete held[path]; emit(); }
          return Promise.resolve(view());
        }
        var value = drafts[path];
        return this.commit(path, value);
      },
      resolve: function (path, choice) {
        var idx = -1;
        conflicts.forEach(function (c, i) { if (c.path === path) idx = i; });
        if (idx < 0) return Promise.resolve(view());
        var c = conflicts[idx];
        conflicts.splice(idx, 1);
        if (choice === 'server') {
          fields[path] = { value: clone(c.server), rev: c.serverRev, deleted: !!c.serverDeleted };
          emit();
          return Promise.resolve(view());
        }
        fields[path] = { value: clone(c.local), rev: c.serverRev, deleted: false };
        return enqueue(path, c.local, false);
      },
      start: function () { hidden = false; if (!server) { status = 'disconnected'; emit(); return Promise.resolve(view()); } return pump().then(function () { loop(); return view(); }); },
      suspend: function () { hidden = true; clearTimeout(timer); timer = null; emit(); },
      resume: function () { hidden = false; if (!server) { status = 'disconnected'; emit(); return Promise.resolve(view()); } return pump().then(function () { loop(); return view(); }); },
      stop: function () { stopped = true; clearTimeout(timer); timer = null; }
    };
  }

  function createHttpServer(opts) {
    opts = opts || {};
    var fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    var base = String(opts.endpoint || '').replace(/\/$/, '');
    var token = opts.token || '';
    var deployed = false;
    function headers() {
      return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    }
    function read(res) {
      if (res.status === 204) { deployed = true; return Promise.resolve({ unchanged: true, revision: null, changes: [] }); }
      return res.json().then(function (body) {
        if (body && (body.key || body.kid)) {
          var err = new Error('budget-key');
          err.code = 'budget-key';
          throw err;
        }
        if (!res.ok) {
          var fail = new Error('relay');
          fail.code = 'relay';
          throw fail;
        }
        deployed = true;
        return body;
      });
    }
    return {
      kind: 'elf-relay',
      get deployed() { return deployed; },
      pull: function (since) {
        if (!fetchImpl || !base || !token) return Promise.reject(new Error('not-configured'));
        return fetchImpl(base + '/api/elf-doc?since=' + encodeURIComponent(since), { headers: headers(), cache: 'no-store' }).then(read);
      },
      push: function (op) {
        if (!fetchImpl || !base || !token) return Promise.reject(new Error('not-configured'));
        return fetchImpl(base + '/api/elf-doc', { method: 'POST', headers: headers(), body: JSON.stringify(op), cache: 'no-store' }).then(read);
      }
    };
  }

  function statusLabel(view) {
    view = view || {};
    if (view.state === 'offline' && view.connected) return 'Offline';
    if (view.state === 'reconnecting' && view.connected) return 'Reconnecting';
    if (view.state === 'saving' && view.connected && view.deployed) return 'Saving';
    if (view.state === 'conflict' && view.connected && view.deployed) return 'Needs a look';
    if (view.state === 'saved' && view.connected && view.deployed) return 'Synced';
    return 'Only on this phone';
  }

  function open(opts) {
    opts = opts || {};
    if (opts.endpoint && opts.token) {
      return createSession({ server: createHttpServer(opts), pollMs: opts.pollMs || 0, fetch: opts.fetch });
    }
    if (!opts.server) return createSession({ server: null, pollMs: opts.pollMs });
    return createSession(opts);
  }

  return { createSimServer: createSimServer, createSession: createSession, createHttpServer: createHttpServer, statusLabel: statusLabel, open: open };
});
