'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const shape = JSON.parse(fs.readFileSync(path.join(root, 'manifest.public-shape.json'), 'utf8'));
const wrap = JSON.parse(fs.readFileSync(path.join(root, 'manifest.enc.json'), 'utf8'));

assert.strictEqual(shape.version, 2);
assert.strictEqual(wrap.scheme, 'aes-256-gcm-iv12');
assert.strictEqual(typeof wrap.data, 'string');
assert.ok(wrap.data.length > 100);
const packed = Buffer.from(wrap.data, 'base64');
assert.ok(packed.length > 28);
assert.notStrictEqual(packed[0], 0x7b);

const expect = { 11: 'being-revised', 17: 'rough' };
const gone = [
  'day-06.v1.1253fc5afe24.bin', 'day-06.p1.d254c2993baf.bin',
  'day-10.v1.f87f618a70f6.bin', 'day-10.p1.efce1facd55d.bin',
  'day-11.v1.6401f0a3156d.bin', 'day-11.p1.9c2d9aa58110.bin',
  'day-14.v1.2eb904c786c2.bin', 'day-14.p1.c1520fb615c7.bin',
  'day-15.v1.d0b8e7ee49f5.bin', 'day-15.p1.31bd39630bbd.bin',
  'day-16.v1.8e2d113f87f6.bin', 'day-16.p1.a42f3c12b105.bin'
];
gone.forEach(function (name) {
  assert.strictEqual(fs.existsSync(path.join(root, 'media', name)), false);
});
let clips = 0;
shape.days.forEach(function (day) {
  assert.ok(day.day >= 1 && day.day <= 25);
  assert.notStrictEqual(day.status, 'final');
  if (expect[day.day]) assert.strictEqual(day.status, expect[day.day]);
  else if (day.day <= 17) assert.strictEqual(day.status, 'current');
  else assert.strictEqual(day.status, null);
  ['video', 'poster'].forEach(function (kind) {
    const node = day[kind];
    if (!node) {
      assert.ok(day.day >= 18);
      return;
    }
    if (kind === 'video') clips += 1;
    assert.match(node.file, /^media\/[A-Za-z0-9._-]+\.bin$/);
    const bytes = fs.readFileSync(path.join(root, node.file));
    assert.strictEqual(bytes.length, node.size);
    assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), node.sha256);
    assert.notStrictEqual(bytes.subarray(4, 8).toString(), 'ftyp');
    assert.notStrictEqual(bytes[0], 0xff);
  });
});
assert.strictEqual(clips, 17);
const pub = fs.readFileSync(path.join(root, 'manifest.public-shape.json'), 'utf8');
assert.strictEqual(pub.includes('caption'), false);
console.log('ok media pack');
