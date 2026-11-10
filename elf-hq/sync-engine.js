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
    var remoteListeners = [];
    var fetches = 0;
    if (server && typeof server.subscribe === 'function') {
      server.subscribe(function (msg) {
        (msg && msg.changes || []).forEach(function (ch) {
          if (conflicts.some(function (c) { return c.path === ch.path; })) return;
          if (queue.some(function (op) { return op.changes.some(function (c) { return c.path === ch.path; }); })) return;
          applyRemote(ch);
        });
        if (msg && msg.revision > since) since = msg.revision;
        if (!queue.length && !conflicts.length) status = 'saved';
        emit();
      });
    }

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
      remoteListeners.forEach(function (fn) { fn(ch); });
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
      stop: function () { stopped = true; clearTimeout(timer); timer = null; if (server && server.close) server.close(); },
      on: function (fn) { listeners.push(fn); },
      onRemote: function (fn) { remoteListeners.push(fn); },
      mediaKey: function () {
        if (!server || typeof server.mediaKey !== 'function') return Promise.reject(new Error('not-configured'));
        return server.mediaKey();
      }
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

  function roomUrl(worker) {
    var base = String(worker || '').replace(/\/$/, '');
    if (base.indexOf('http://') === 0) return 'ws://' + base.slice('http://'.length) + '/room';
    if (base.indexOf('https://') === 0) return 'wss://' + base.slice('https://'.length) + '/room';
    if (base.indexOf('ws://') === 0 || base.indexOf('wss://') === 0) return base + '/room';
    return 'wss://' + base + '/room';
  }

  function readSocketData(data, cb) {
    if (typeof data === 'string') { cb(data); return; }
    if (data && typeof data.text === 'function') { data.text().then(cb, function () { cb(''); }); return; }
    try { cb(new TextDecoder().decode(data)); }
    catch (e) { cb(''); }
  }

  function tainted(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.kid || Object.prototype.hasOwnProperty.call(msg, 'key')) return true;
    if (msg.body && (msg.body.key || msg.body.kid)) return true;
    return false;
  }

  function createRoomServer(opts) {
    opts = opts || {};
    var worker = opts.worker || '';
    var token = opts.token || '';
    var WS = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    var ws = null;
    var helloOk = false;
    var opened = false;
    var pending = {};
    var seq = 0;
    var listeners = [];
    var connecting = null;
    var api = {
      kind: 'elf-room',
      fail: false,
      get deployed() { return opened; },
      subscribe: function (fn) { listeners.push(fn); },
      close: function () {
        try { if (ws) ws.close(); } catch (e) {}
        ws = null;
        helloOk = false;
      }
    };

    function rejectPending(err) {
      Object.keys(pending).forEach(function (id) {
        pending[id].reject(err);
        delete pending[id];
      });
    }

    function connect() {
      if (helloOk && ws && ws.readyState === 1) return Promise.resolve();
      if (connecting) return connecting;
      connecting = new Promise(function (resolve, reject) {
        if (!WS || !worker || !token) {
          connecting = null;
          reject(new Error('not-configured'));
          return;
        }
        var sock;
        try { sock = new WS(roomUrl(worker)); }
        catch (err) { connecting = null; reject(err); return; }
        ws = sock;
        sock.binaryType = 'arraybuffer';
        var timer = setTimeout(function () {
          connecting = null;
          try { sock.close(); } catch (e) {}
          reject(new Error('timeout'));
        }, 8000);
        sock.onopen = function () {
          try { sock.send(JSON.stringify({ type: 'hello', session: token })); }
          catch (err) { clearTimeout(timer); connecting = null; reject(err); }
        };
        sock.onmessage = function (ev) {
          readSocketData(ev.data, function (text) {
          var msg;
          try { msg = JSON.parse(text); }
          catch (e) { return; }
          if (tainted(msg)) {
            api.close();
            clearTimeout(timer);
            connecting = null;
            rejectPending(Object.assign(new Error('budget-key'), { code: 'budget-key' }));
            return;
          }
          if (msg.type === 'hello' && msg.ok) {
            helloOk = true;
            opened = true;
            clearTimeout(timer);
            connecting = null;
            resolve();
            return;
          }
          if (msg.type === 'remote') {
            listeners.forEach(function (fn) { fn(msg); });
            return;
          }
          if (msg.id && pending[msg.id]) {
            pending[msg.id].resolve(msg);
            delete pending[msg.id];
          }
          });
        };
        sock.onerror = function () {};
        sock.onclose = function () {
          helloOk = false;
          ws = null;
          clearTimeout(timer);
          if (connecting) {
            var fail = connecting;
            connecting = null;
            reject(new Error('closed'));
            void fail;
          }
          rejectPending(new Error('closed'));
        };
      }).then(function (value) { connecting = null; return value; }, function (err) { connecting = null; throw err; });
      return connecting;
    }

    function rpc(type, extra) {
      if (api.fail) return Promise.reject(new Error('offline'));
      return connect().then(function () {
        if (!ws || ws.readyState !== 1) return Promise.reject(new Error('offline'));
        var id = 'c' + (++seq);
        return new Promise(function (resolve, reject) {
          var timer = setTimeout(function () {
            if (!pending[id]) return;
            delete pending[id];
            reject(new Error('timeout'));
          }, 8000);
          pending[id] = {
            resolve: function (msg) { clearTimeout(timer); resolve(msg); },
            reject: function (err) { clearTimeout(timer); reject(err); }
          };
          try { ws.send(JSON.stringify(Object.assign({ type: type, id: id }, extra || {}))); }
          catch (err) { clearTimeout(timer); delete pending[id]; reject(err); }
        });
      });
    }

    api.pull = function (since) {
      return rpc('pull', { since: since }).then(function (msg) {
        return { revision: msg.revision, changes: msg.changes || [] };
      });
    };
    api.push = function (op) {
      return rpc('push', { op: op }).then(function (msg) {
        var body = msg.body || {};
        var result = body.result || {};
        return { revision: result.revision, applied: result.applied || [], conflicts: result.conflicts || [] };
      });
    };
    api.mediaKey = function () {
      return rpc('media-key', {}).then(function (msg) {
        if (!msg || !msg.mediaKey || msg.error) return Promise.reject(new Error('media'));
        return msg.mediaKey;
      });
    };
    return api;
  }

  function resolveLive(cfg) {
    cfg = cfg || {};
    if (cfg.enabled !== true) return { worker: null, session: null };
    return { worker: cfg.worker || null, session: cfg.session || null };
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
    if (opts.enabled === false) return createSession({ server: null, pollMs: opts.pollMs });
    if (opts.worker && opts.token) {
      return createSession({ server: createRoomServer(opts), pollMs: opts.pollMs == null ? 0 : opts.pollMs });
    }
    if (opts.endpoint && opts.token) {
      return createSession({ server: createHttpServer(opts), pollMs: opts.pollMs || 0, fetch: opts.fetch });
    }
    if (!opts.server) return createSession({ server: null, pollMs: opts.pollMs });
    return createSession(opts);
  }

  return { createSimServer: createSimServer, createSession: createSession, createHttpServer: createHttpServer, createRoomServer: createRoomServer, resolveLive: resolveLive, statusLabel: statusLabel, open: open };
});
