'use strict';
const assert = require('assert');
const Fit = require('./media-fit');
const media = require('./media-manifest');

assert.strictEqual(Fit.detect({ container: 'mp4', codec: 'avc1', alphaDeclared: true }).alpha, false);
assert.strictEqual(Fit.detect({ container: 'mp4', codec: 'avc1', alphaDeclared: true }).reason, 'opaque-mp4');
assert.strictEqual(Fit.detect({ container: 'mp4', codec: 'avc1' }).plate, Fit.PLATE);

assert.strictEqual(Fit.detect({ container: 'webm', codec: 'vp9', alphaDeclared: true }).alpha, true);
assert.strictEqual(Fit.detect({ container: 'webm', codec: 'vp9', alphaDeclared: true }).playsOn, 'chromium');
assert.strictEqual(Fit.detect({ container: 'mp4', codec: 'hvc1', alphaDeclared: true }).playsOn, 'safari');
assert.strictEqual(Fit.detect({ container: 'webp', codec: 'webp', alphaDeclared: true }).playsOn, 'both');
assert.strictEqual(Fit.detect({ container: 'webm', codec: 'vp9', alphaDeclared: false }).alpha, false);

var day = media.manifest.days[0];
var empty = Fit.describe(day);
assert.strictEqual(empty.alpha, false);
assert.strictEqual(empty.reason, 'no-file');
assert.strictEqual(empty.crop, false);
assert.strictEqual(empty.plate, '#E8F2E5');
assert.strictEqual(Fit.PLATE, '#E8F2E5');
assert.strictEqual(media.manifest.composition.cssRemovesBackground, false);
assert.strictEqual(media.manifest.composition.pixelKeying, false);
assert.strictEqual(media.manifest.composition.plate, Fit.PLATE);
assert.strictEqual(media.manifest.days[0].standInIsFinal, false);
assert.strictEqual(media.manifest.days[0].restoring, 'flour, donut, car tracks');
const css = require('fs').readFileSync(require('path').join(__dirname, 'styles.css'), 'utf8');
assert.strictEqual(css.split('#E8F2E5').length - 1, 1);

var mixed = Fit.describe({ delivery: [
  { container: 'mp4', codec: 'avc1', alphaDeclared: true },
  { container: 'webm', codec: 'vp9', alphaDeclared: true }
] });
assert.strictEqual(mixed.alpha, true);
assert.strictEqual(mixed.playsOn, 'chromium');

console.log('ok media fit');
