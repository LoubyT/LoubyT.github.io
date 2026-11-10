/* Decrypts the private film pack after an authenticated session hands over the key.
 * manifest.enc.json is {"scheme":"aes-256-gcm-iv12","data":base64(iv||ciphertext||tag)}.
 * Each media/*.bin is raw 12-byte IV || ciphertext || tag.
 * The public build never constructs a vault, so it never fetches these files.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfVault = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function decodeKey(text) {
    var clean = String(text || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    var pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4));
    var bin = atob(clean + pad);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    if (out.length !== 32) throw new Error('media-key');
    return out;
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return hex;
  }

  async function sha256(bytes) {
    var digest = await crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(digest));
  }

  async function importKey(raw) {
    var copy = new Uint8Array(raw);
    return crypto.subtle.importKey('raw', copy.buffer, { name: 'AES-GCM' }, false, ['decrypt']);
  }

  async function decryptRaw(key, packed) {
    if (!packed || packed.length < 28) throw new Error('short');
    var iv = new Uint8Array(packed.subarray(0, 12));
    var data = new Uint8Array(packed.subarray(12));
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, tagLength: 128 }, key, data);
    return new Uint8Array(plain);
  }

  function sniff(bytes) {
    if (!bytes || bytes.length < 12) return '';
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
    return '';
  }

  function safeFile(file) {
    if (typeof file !== 'string') return '';
    var path = file.split('?')[0].split('#')[0];
    var name = path.split('/').pop();
    if (!/^[A-Za-z0-9._-]+\.bin$/.test(name)) return '';
    if (path.indexOf('..') !== -1) return '';
    if (path === 'media/' + name || path === name) return 'media/' + name;
    if (/\/media\/[A-Za-z0-9._-]+\.bin$/.test(path)) return 'media/' + name;
    return '';
  }

  function fileRef(node, fallbackSha) {
    if (!node) return null;
    if (typeof node === 'string') {
      var named = safeFile(node);
      return named ? { file: named, mime: '', sha256: fallbackSha || '', size: 0 } : null;
    }
    var file = safeFile(node.file || node.path || node.src || '');
    if (!file) return null;
    return {
      file: file,
      mime: String(node.mime || node.contentType || node.type || ''),
      sha256: String(node.sha256 || node.hash || fallbackSha || ''),
      size: Number(node.size) || 0
    };
  }

  function badge(status) {
    if (status === 'being-revised') return 'Being revised';
    if (status === 'rough') return 'Rough cut';
    return '';
  }

  function dayNumber(entry) {
    if (!entry) return 0;
    var raw = entry.day != null ? entry.day : (entry.dayId != null ? entry.dayId : entry.number);
    if (typeof raw === 'number' && raw > 0) return raw;
    var match = String(raw || '').match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function normalize(doc) {
    var days = {};
    var list = doc && Array.isArray(doc.days) ? doc.days : (doc && Array.isArray(doc.clips) ? doc.clips : []);
    list.forEach(function (entry) {
      var number = dayNumber(entry);
      if (!number) return;
      var video = fileRef(entry.video || entry.videoFile, typeof entry.sha256 === 'string' ? entry.sha256 : '');
      var poster = fileRef(entry.poster || entry.posterFile, '');
      days[number] = {
        day: number,
        status: entry.status || '',
        caption: typeof entry.caption === 'string' ? entry.caption : '',
        badge: badge(entry.status),
        video: video,
        poster: poster
      };
    });
    return days;
  }

  function copyBytes(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  function videoType() {
    return 'video/mp4';
  }

  function imageType(file) {
    var mime = String(file.mime || sniff(file.bytes) || '');
    if (mime.indexOf('image/') === 0) return mime.split(';')[0];
    return 'image/jpeg';
  }

  function decodeBytes(text) {
    var clean = String(text || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    var pad = clean.length % 4 === 0 ? '' : '='.repeat(4 - (clean.length % 4));
    var bin = atob(clean + pad);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function createVault(opts) {
    opts = opts || {};
    var fetchImpl = opts.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    var base = String(opts.base || '');
    var key = null;
    var days = null;
    var current = null;
    var urls = [];

    function drop() {
      urls.forEach(function (url) {
        try { URL.revokeObjectURL(url); } catch (e) {}
      });
      urls = [];
      current = null;
    }

    async function decryptFile(ref) {
      var res = await fetchImpl(base + ref.file, { cache: 'no-store' });
      if (!res.ok) throw new Error('file');
      var packed = new Uint8Array(await res.arrayBuffer());
      var plain = await decryptRaw(key, packed);
      var note = '';
      if (ref.sha256) {
        var want = ref.sha256.toLowerCase();
        var fileHash = await sha256(packed);
        var plainHash = await sha256(plain);
        if (want !== fileHash && want !== plainHash) note = 'hash';
      }
      if (ref.size && packed.length !== ref.size && plain.length !== ref.size) note = note || 'size';
      return { bytes: plain, mime: ref.mime || sniff(plain), note: note };
    }

    return {
      ready: function () { return !!days; },
      peek: function (day) { return days ? days[Number(day)] || null : null; },
      badge: badge,
      close: drop,
      setKey: function (raw) { key = raw; },
      loadManifest: async function () {
        if (!key || !fetchImpl) throw new Error('not-configured');
        var cryptoKey = await importKey(key);
        var res = await fetchImpl(base + 'manifest.enc.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('manifest');
        var text = await res.text();
        var wrap = JSON.parse(text);
        if (!wrap || wrap.scheme !== 'aes-256-gcm-iv12' || typeof wrap.data !== 'string') throw new Error('manifest');
        var plain = await decryptRaw(cryptoKey, decodeBytes(wrap.data));
        days = normalize(JSON.parse(new TextDecoder().decode(plain)));
        key = cryptoKey;
        return days;
      },
      openDay: async function (day, mode) {
        mode = mode || {};
        if (!days || !key) throw new Error('not-ready');
        var entry = days[Number(day)];
        if (!entry || !entry.video) return null;
        if (current && current.day === entry.day && current.videoUrl) {
          current.play = mode.play === true || !mode.reduced;
          return current;
        }
        drop();
        var video = await decryptFile(entry.video);
        var poster = null;
        if (entry.poster) {
          try { poster = await decryptFile(entry.poster); } catch (e) { poster = null; }
        }
        var videoUrl = URL.createObjectURL(new Blob([copyBytes(video.bytes)], { type: videoType() }));
        urls.push(videoUrl);
        var posterUrl = '';
        if (poster) {
          posterUrl = URL.createObjectURL(new Blob([copyBytes(poster.bytes)], { type: imageType(poster) }));
          urls.push(posterUrl);
        }
        video.bytes = null;
        if (poster) poster.bytes = null;
        current = {
          day: entry.day,
          badge: entry.badge,
          caption: entry.caption,
          videoUrl: videoUrl,
          posterUrl: posterUrl,
          note: video.note || '',
          play: mode.play === true || !mode.reduced
        };
        return current;
      }
    };
  }

  return { decodeKey: decodeKey, badge: badge, normalize: normalize, createVault: createVault, sniff: sniff };
});
