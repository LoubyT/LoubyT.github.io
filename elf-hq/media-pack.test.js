'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const shape = JSON.parse(fs.readFileSync(path.join(root, 'manifest.public-shape.json'), 'utf8'));
const wrap = JSON.parse(fs.readFileSync(path.join(root, 'manifest.enc.json'), 'utf8'));

assert.strictEqual(shape.version, 7);
assert.strictEqual(wrap.scheme, 'aes-256-gcm-iv12');
assert.strictEqual(typeof wrap.data, 'string');
assert.ok(wrap.data.length > 100);
const packed = Buffer.from(wrap.data, 'base64');
assert.ok(packed.length > 28);
assert.throws(function () { JSON.parse(packed.toString('utf8')); });
assert.strictEqual(JSON.stringify(shape).includes('"final":true'), false);
assert.strictEqual(shape.bonus, undefined);
assert.strictEqual(shape.bonusFilm.status, 'rough');
assert.notStrictEqual(shape.bonusFilm.final, true);

const gone = [
  'day-07.p1.77a6f3041da9.bin', 'day-07.v1.5820da046eb0.bin',
  'day-09.p1.1984e498e37e.bin', 'day-09.v1.2eaee28102ff.bin',
  'day-09.p2.d58186fe88f4.bin', 'day-09.v2.d0a371a85cc8.bin',
  'day-11.p2.bef4843691d9.bin', 'day-11.v2.2f120951f7a6.bin',
  'day-11.p3.99996a2cf4e1.bin', 'day-11.v3.f50109e0a5eb.bin',
  'day-12.p1.5c9b528474ca.bin', 'day-12.v1.0bc9dffa4e79.bin',
  'day-13.p1.5e0f631b1f45.bin', 'day-13.v1.bab14ddd7cba.bin',
  'day-16.p2.45b5f7dada06.bin', 'day-16.v2.c49a6da6e9d1.bin',
  'bonus.v3.c5d2a9f01529.bin', 'bonus.p3.90fe7d2d1215.bin'
];
gone.forEach(function (name) {
  assert.strictEqual(fs.existsSync(path.join(root, 'media', name)), false);
});
const referenced = new Set();
let clips = 0;
shape.days.forEach(function (day) {
  assert.ok(day.day >= 1 && day.day <= 25);
  assert.notStrictEqual(day.status, 'final');
  assert.notStrictEqual(day.final, true);
  if (day.day === 17) assert.strictEqual(day.status, 'rough');
  else assert.strictEqual(day.status, 'current');
  ['video', 'poster'].forEach(function (kind) {
    const node = day[kind];
    if (!node) assert.fail('day ' + day.day + ' has no ' + kind);
    if (kind === 'video') clips += 1;
    assert.match(node.file, /^media\/[A-Za-z0-9._-]+\.bin$/);
    assert.notStrictEqual(node.final, true);
    const name = path.basename(node.file);
    referenced.add(name);
    const bytes = fs.readFileSync(path.join(root, node.file));
    assert.strictEqual(bytes.length, node.size);
    assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), node.sha256);
    assert.notStrictEqual(bytes.subarray(4, 8).toString(), 'ftyp');
    assert.notStrictEqual(bytes[0], 0xff);
  });
});
assert.strictEqual(clips, 25);
['video', 'poster'].forEach(function (kind) {
  const node = shape.bonusFilm[kind];
  assert.match(node.file, /^media\/bonus\.[A-Za-z0-9._-]+\.bin$/);
  assert.notStrictEqual(node.final, true);
  const name = path.basename(node.file);
  referenced.add(name);
  const bytes = fs.readFileSync(path.join(root, node.file));
  assert.strictEqual(bytes.length, node.size);
  assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), node.sha256);
  assert.ok(node.sha256.startsWith(name.split('.').slice(-2, -1)[0]));
  assert.notStrictEqual(bytes.subarray(4, 8).toString(), 'ftyp');
  assert.notStrictEqual(bytes[0], 0xff);
});
const onDisk = new Set(fs.readdirSync(path.join(root, 'media')).filter(function (name) { return name.endsWith('.bin'); }));
assert.deepStrictEqual(onDisk, referenced);
assert.strictEqual(onDisk.size, 52);
const pub = fs.readFileSync(path.join(root, 'manifest.public-shape.json'), 'utf8');
assert.strictEqual(pub.includes('caption'), false);
console.log('ok media pack');
