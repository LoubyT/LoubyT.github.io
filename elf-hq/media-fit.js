/* How a daily picture sits on the page.
 * CSS cannot remove a background that was baked into a file.
 * An ordinary H.264 MP4 stays opaque. Alpha is recognized only for
 * formats that actually carry it: VP9/VP8 WebM (Chromium), HEVC-with-alpha
 * MP4 (Safari), or animated WebP (both). Nothing is keyed in the browser.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfMediaFit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PLATE = '#E8F2E5';

  function detect(file) {
    var container = String(file && file.container || '').toLowerCase();
    var codec = String(file && file.codec || '').toLowerCase();
    var declared = !!(file && file.alphaDeclared);
    var kind = 'opaque';
    var playsOn = 'both';
    if (declared && container === 'webm' && (codec === 'vp9' || codec === 'vp8')) {
      kind = 'alpha';
      playsOn = 'chromium';
    } else if (declared && container === 'mp4' && (codec === 'hvc1' || codec === 'hev1')) {
      kind = 'alpha';
      playsOn = 'safari';
    } else if (declared && (container === 'webp' || codec === 'webp')) {
      kind = 'alpha';
      playsOn = 'both';
    }
    return {
      alpha: kind === 'alpha',
      opaque: kind !== 'alpha',
      playsOn: playsOn,
      reason: kind === 'alpha' ? 'alpha-' + container : (container === 'mp4' ? 'opaque-mp4' : 'opaque'),
      plate: kind === 'alpha' ? 'transparent' : PLATE,
      claimedTransparent: false
    };
  }

  function describe(entry) {
    var files = entry && entry.delivery ? [].concat(entry.delivery) : [];
    var best = null;
    files.forEach(function (file) {
      var found = detect(file);
      if (found.alpha && !best) best = found;
    });
    if (!files.length || !best) {
      var opaque = files.length ? detect(files[0]) : null;
      return {
        alpha: false,
        opaque: true,
        plate: PLATE,
        reason: opaque ? opaque.reason : 'no-file',
        fit: 'contain',
        crop: false,
        claimedTransparent: false,
        playsOn: opaque ? opaque.playsOn : 'none'
      };
    }
    return {
      alpha: true,
      opaque: false,
      plate: 'transparent',
      reason: best.reason,
      fit: 'contain',
      crop: false,
      claimedTransparent: false,
      playsOn: best.playsOn
    };
  }

  return { PLATE: PLATE, detect: detect, describe: describe };
});
