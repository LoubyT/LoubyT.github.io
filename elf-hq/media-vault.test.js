'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Vault = require('./media-vault');

function seal(key, plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([iv, body]);
}

(async function () {
  assert.strictEqual(Vault.badge('being-revised'), 'Being revised');
  assert.strictEqual(Vault.badge('rough'), 'Rough cut');
  assert.strictEqual(Vault.badge('current'), '');
  assert.strictEqual(Vault.badge(null), '');

  const key = crypto.randomBytes(32);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elf-media-'));
  const mp4 = path.join(dir, 'tiny.mp4');
  const jpg = path.join(dir, 'tiny.jpg');
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0xE8F2E5:s=64x64:d=1', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'ignore' });
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0xE8F2E5:s=32x32', '-frames:v', '1', jpg], { stdio: 'ignore' });
  const videoPlain = fs.readFileSync(mp4);
  const posterPlain = fs.readFileSync(jpg);
  const videoBin = seal(key, videoPlain);
  const posterBin = seal(key, posterPlain);
  const videoName = 'media/day-01.v1.synthetic.bin';
  const posterName = 'media/day-01.p1.synthetic.bin';
  const doc = {
    version: 1,
    days: [
      {
        day: 1,
        status: 'being-revised',
        caption: 'A sample clip',
        video: { file: videoName, mime: 'video/mp4', size: videoBin.length, sha256: crypto.createHash('sha256').update(videoBin).digest('hex') },
        poster: { file: posterName, mime: 'image/jpeg', size: posterBin.length, sha256: crypto.createHash('sha256').update(posterBin).digest('hex') }
      },
      { day: 17, status: null }
    ]
  };
  const manifestBin = seal(key, Buffer.from(JSON.stringify(doc)));
  const manifest = JSON.stringify({ scheme: 'aes-256-gcm-iv12', data: manifestBin.toString('base64') });
  const manifestUrl = 'manifest.enc.json?v=22';
  const files = { [manifestUrl]: manifest, [videoName]: videoBin, [posterName]: posterBin };
  let fetches = [];
  const vault = Vault.createVault({
    base: '',
    fetch: function (url) {
      fetches.push(url);
      const body = files[url];
      if (!body) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async function () { return body.toString(); },
        arrayBuffer: async function () { return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength); }
      });
    }
  });
  let revoked = [];
  const real = URL.revokeObjectURL;
  URL.revokeObjectURL = function (u) { revoked.push(u); return real.call(URL, u); };
  vault.setKey(key);
  await vault.loadManifest();
  assert.deepStrictEqual(fetches, [manifestUrl]);
  assert.strictEqual(vault.peek(17).video, null);
  assert.strictEqual(vault.peek(1).badge, 'Being revised');
  const slot = await vault.openDay(1, { reduced: true });
  assert.strictEqual(slot.play, false);
  assert.strictEqual(Vault.sniff(videoPlain), 'video/mp4');
  assert.strictEqual(slot.badge, 'Being revised');
  assert.strictEqual(slot.caption, 'A sample clip');
  assert.ok(slot.posterUrl);
  assert.ok(slot.videoUrl);
  const again = await vault.openDay(1, { play: true, reduced: true });
  assert.strictEqual(again.videoUrl, slot.videoUrl);
  assert.strictEqual(again.play, true);
  vault.close();
  assert.ok(revoked.indexOf(slot.videoUrl) >= 0);
  assert.ok(revoked.indexOf(slot.posterUrl) >= 0);
  URL.revokeObjectURL = real;

  const shaped = Vault.normalize({
    days: [
      { day: 6, status: 'being-revised', caption: 'Sample', video: { file: 'media/day-06.v1.abc.bin', mime: 'video/mp4', sha256: 'aa' }, poster: { file: 'media/day-06.p1.abc.bin', mime: 'image/jpeg' } },
      { day: 14, status: 'rough', video: 'media/not a path' },
      { day: 16, status: 'rough', video: { file: '../secret.bin' } }
    ]
  });
  assert.strictEqual(shaped[6].badge, 'Being revised');
  assert.strictEqual(shaped[6].video.mime, 'video/mp4');
  assert.strictEqual(shaped[14].video, null);
  assert.strictEqual(shaped[16].video, null);
  const aliased = Vault.normalize({
    days: [{ day: 'day-01', video: 'https://www.louby.net/elf-hq/media/day-01.v1.abc.bin' }]
  });
  assert.strictEqual(aliased[1].video.file, 'media/day-01.v1.abc.bin');
  const feature = Vault.bonusOf({
    bonusFilm: { status: 'rough', video: 'media/bonus.v3.abc.bin', poster: { file: 'media/bonus.p3.abc.bin' } }
  });
  assert.strictEqual(feature.badge, 'Rough cut');
  assert.strictEqual(feature.video.file, 'media/bonus.v3.abc.bin');
  assert.strictEqual(feature.poster.file, 'media/bonus.p3.abc.bin');
  assert.strictEqual(Vault.bonusOf({ days: [] }), null);

  const loose = Vault.createVault({
    base: '',
    fetch: function (url) {
      const body = files[url];
      if (!body) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async function () { return body.toString(); },
        arrayBuffer: async function () { return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength); }
      });
    }
  });
  const wrong = JSON.parse(JSON.stringify(doc));
  wrong.days[0].video.sha256 = 'deadbeef';
  wrong.days[0].video.size = 12;
  const wrongManifest = JSON.stringify({ scheme: 'aes-256-gcm-iv12', data: seal(key, Buffer.from(JSON.stringify(wrong))).toString('base64') });
  files[manifestUrl] = wrongManifest;
  loose.setKey(key);
  await loose.loadManifest();
  const played = await loose.openDay(1, { reduced: true });
  assert.ok(played.videoUrl);
  assert.strictEqual(played.note, 'hash');
  loose.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('ok media vault');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});