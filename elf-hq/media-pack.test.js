'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const shape = JSON.parse(fs.readFileSync(path.join(root, 'manifest.public-shape.json'), 'utf8'));
const wrap = JSON.parse(fs.readFileSync(path.join(root, 'manifest.enc.json'), 'utf8'));

assert.strictEqual(wrap.scheme, 'aes-256-gcm-iv12');
assert.strictEqual(typeof wrap.data, 'string');
assert.ok(wrap.data.length > 100);
const packed = Buffer.from(wrap.data, 'base64');
assert.ok(packed.length > 28);
assert.notStrictEqual(packed[0], 0x7b);

const expect = { 6: 'being-revised', 10: 'being-revised', 11: 'being-revised', 14: 'rough', 15: 'rough', 16: 'rough' };
let clips = 0;
shape.days.forEach(function (day) {
  assert.ok(day.day >= 1 && day.day <= 25);
  if (expect[day.day]) assert.strictEqual(day.status, expect[day.day]);
  if (day.day >= 17) assert.strictEqual(day.status, null);
  if (day.day <= 16 && day.day !== 6 && day.day !== 10 && day.day !== 11 && day.day < 14) assert.strictEqual(day.status, 'current');
  ['video', 'poster'].forEach(function (kind) {
    const node = day[kind];
    if (!node) {
      assert.ok(day.day >= 17);
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
assert.strictEqual(clips, 16);
const pub = fs.readFileSync(path.join(root, 'manifest.public-shape.json'), 'utf8');
assert.strictEqual(pub.includes('caption'), false);
console.log('ok media pack');
