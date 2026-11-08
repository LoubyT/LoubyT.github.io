/* One-browser rehearsal notebook. IndexedDB name is elf-hq-rehearsal.
 * This is not sync. If IndexedDB is missing, edits stay in memory and the
 * app is told to say so. Saves that fail leave the previous record in place.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfScratch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DB = 'elf-hq-rehearsal';

  function memory(failed) {
    var kv = null;
    var photos = {};
    return {
      persistent: false,
      failed: !!failed,
      load: function () { return Promise.resolve(kv); },
      save: function (value) {
        kv = value;
        return Promise.resolve({ ok: true, persistent: false });
      },
      putPhoto: function (rec) {
        photos[rec.id] = rec;
        return Promise.resolve({ ok: true });
      },
      getPhoto: function (id) { return Promise.resolve(photos[id] ? photos[id].blob : null); },
      deletePhoto: function (id) { delete photos[id]; return Promise.resolve({ ok: true }); },
      listPhotoMeta: function () {
        return Promise.resolve(Object.keys(photos).map(function (id) {
          var p = photos[id];
          return { id: id, dayId: p.dayId, bytes: p.bytes, type: p.type, createdAt: p.createdAt };
        }));
      }
    };
  }

  function idb() {
    return new Promise(function (resolve) {
      var req;
      try { req = indexedDB.open(DB, 1); }
      catch (e) { resolve(memory(true)); return; }
      req.onerror = function () { resolve(memory(true)); };
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      req.onsuccess = function () {
        var db = req.result;
        function run(store, mode, fn) {
          return new Promise(function (res, rej) {
            var tx;
            try { tx = db.transaction(store, mode); }
            catch (e) { rej(e); return; }
            var out;
            try { out = fn(tx.objectStore(store)); }
            catch (e) { rej(e); return; }
            tx.oncomplete = function () { res(out && out.result); };
            tx.onerror = function () { rej(tx.error || new Error('store failed')); };
            tx.onabort = function () { rej(tx.error || new Error('store aborted')); };
          });
        }
        resolve({
          persistent: true,
          failed: false,
          load: function () { return run('kv', 'readonly', function (s) { return s.get('overrides'); }); },
          save: function (value) {
            return run('kv', 'readwrite', function (s) { return s.put(value, 'overrides'); })
              .then(function () { return { ok: true, persistent: true }; })
              .catch(function (err) {
                var code = err && (err.name === 'QuotaExceededError' || err.code === 22) ? 'quota' : 'save';
                return { ok: false, code: code, persistent: true };
              });
          },
          putPhoto: function (rec) {
            return run('photos', 'readwrite', function (s) { return s.put(rec, rec.id); })
              .then(function () { return { ok: true }; })
              .catch(function (err) {
                var code = err && err.name === 'QuotaExceededError' ? 'quota' : 'save';
                return { ok: false, code: code };
              });
          },
          getPhoto: function (id) {
            return run('photos', 'readonly', function (s) { return s.get(id); })
              .then(function (rec) { return rec ? rec.blob : null; })
              .catch(function () { return null; });
          },
          deletePhoto: function (id) {
            return run('photos', 'readwrite', function (s) { return s.delete(id); })
              .then(function () { return { ok: true }; })
              .catch(function () { return { ok: false, code: 'save' }; });
          },
          listPhotoMeta: function () {
            return new Promise(function (res) {
              var tx = db.transaction('photos', 'readonly');
              var reqAll = tx.objectStore('photos').getAll();
              reqAll.onsuccess = function () {
                res((reqAll.result || []).map(function (p) {
                  return { id: p.id, dayId: p.dayId, bytes: p.bytes || (p.blob && p.blob.size) || 0, type: p.type, createdAt: p.createdAt };
                }));
              };
              reqAll.onerror = function () { res([]); };
            });
          }
        });
      };
    });
  }

  function open() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(memory(true));
    return idb();
  }

  return { open: open, memory: memory };
});
