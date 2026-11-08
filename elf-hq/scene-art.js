/* Felt-diorama stand-ins. Props only: no face, no name, no video.
 * Each day gets its own cloth color and silhouette so the slots are not
 * one picture copied twenty-five times.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfScenes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function propMarkup(motif, swatch, accent) {
    var s = swatch;
    var a = accent;
    switch (motif) {
      case 'stars':
        return '<polygon points="70,78 76,96 96,96 80,108 86,126 70,114 54,126 60,108 44,96 64,96" fill="' + s + '"/><polygon points="118,96 122,108 136,108 125,116 129,128 118,120 107,128 111,116 100,108 114,108" fill="' + a + '"/>';
      case 'pinecone':
        return '<ellipse cx="90" cy="150" rx="26" ry="16" fill="' + s + '"/><ellipse cx="90" cy="132" rx="22" ry="14" fill="' + a + '"/><ellipse cx="90" cy="116" rx="16" ry="12" fill="' + s + '"/><ellipse cx="90" cy="104" rx="10" ry="8" fill="' + a + '"/>';
      case 'sock':
        return '<path d="M78 90 h28 v46 h18 v16 h-46 v-16 h-8 z" fill="' + s + '"/><rect x="78" y="90" width="28" height="10" fill="' + a + '"/>';
      case 'birds':
        return '<path d="M48 120 q16 -28 32 0 q-16 8 -32 0" fill="' + s + '"/><path d="M86 112 q18 -26 34 0 q-16 8 -34 0" fill="' + a + '"/><path d="M66 136 q16 -24 30 0 q-14 8 -30 0" fill="' + s + '"/>';
      case 'cocoa':
        return '<rect x="70" y="96" width="44" height="36" rx="4" fill="' + s + '"/><rect x="114" y="108" width="16" height="12" rx="6" fill="' + a + '"/>';
      case 'wreath':
        return '<circle cx="90" cy="120" r="34" fill="none" stroke="' + s + '" stroke-width="14"/><circle cx="90" cy="86" r="5" fill="' + a + '"/><circle cx="118" cy="104" r="4" fill="' + a + '"/><circle cx="70" cy="140" r="4" fill="' + a + '"/>';
      case 'pebbles':
        return '<ellipse cx="62" cy="136" rx="14" ry="10" fill="' + s + '"/><ellipse cx="90" cy="128" rx="16" ry="12" fill="' + a + '"/><ellipse cx="118" cy="138" rx="13" ry="9" fill="' + s + '"/>';
      case 'lantern':
        return '<rect x="74" y="96" width="36" height="48" rx="8" fill="' + s + '" opacity=".9"/><rect x="84" y="84" width="16" height="12" fill="' + a + '"/><rect x="80" y="108" width="24" height="16" fill="#f6efe2" opacity=".45"/>';
      case 'mittens':
        return '<path d="M58 108 h22 v28 q0 16 -14 16 q-16 0 -16 -18 z" fill="' + s + '"/><path d="M100 100 h22 v30 q0 16 -14 16 q-16 0 -16 -18 z" fill="' + a + '"/>';
      case 'moons':
        return '<circle cx="96" cy="120" r="28" fill="' + s + '"/><circle cx="108" cy="112" r="22" fill="#f3e2c8"/>';
      case 'sled':
        return '<path d="M48 126 h84 l-10 16 h-64 z" fill="' + s + '"/><path d="M52 148 q20 16 76 0" fill="none" stroke="' + a + '" stroke-width="4"/>';
      case 'bells':
        return '<path d="M62 96 q18 8 18 28 h-36 q0 -20 18 -28" fill="' + s + '"/><path d="M108 102 q16 8 16 24 h-32 q0 -16 16 -24" fill="' + a + '"/><circle cx="80" cy="128" r="4" fill="#f6efe2"/><circle cx="124" cy="130" r="3" fill="#f6efe2"/>';
      case 'popcorn':
        return '<path d="M40 120 h100" stroke="' + a + '" stroke-width="2"/><circle cx="58" cy="112" r="8" fill="' + s + '"/><circle cx="90" cy="108" r="10" fill="#f6efe2"/><circle cx="120" cy="114" r="8" fill="' + s + '"/>';
      case 'firs':
        return '<polygon points="58,140 70,100 82,140" fill="' + s + '"/><polygon points="84,144 100,92 116,144" fill="' + a + '"/><polygon points="112,138 124,108 136,138" fill="' + s + '"/>';
      case 'bookmark':
        return '<path d="M78 86 h28 v62 l-14 -10 -14 10 z" fill="' + s + '"/><polygon points="92,100 94,106 100,106 95,110 97,116 92,112 87,116 89,110 84,106 90,106" fill="' + a + '"/>';
      case 'spices':
        return '<rect x="70" y="100" width="28" height="40" rx="4" fill="' + s + '"/><rect x="78" y="92" width="12" height="10" fill="' + a + '"/><path d="M108 110 q16 8 8 20 q-14 -4 -8 -20" fill="' + a + '"/>';
      case 'houses':
        return '<polygon points="48,140 48,112 64,96 80,112 80,140" fill="' + s + '"/><polygon points="86,140 86,108 108,90 130,108 130,140" fill="' + a + '"/>';
      case 'wands':
        return '<path d="M70 150 l44 -64" stroke="' + a + '" stroke-width="4"/><polygon points="112,78 116,90 128,90 118,98 122,110 112,102 102,110 106,98 96,90 108,90" fill="' + s + '"/>';
      case 'coasters':
        return '<ellipse cx="74" cy="132" rx="22" ry="14" fill="' + s + '"/><ellipse cx="112" cy="124" rx="22" ry="14" fill="' + a + '"/>';
      case 'stamps':
        return '<rect x="58" y="100" width="64" height="48" fill="#e7d3b4"/><polygon points="90,112 94,122 104,122 96,128 99,138 90,132 81,138 84,128 76,122 86,122" fill="' + s + '"/>';
      case 'luminaries':
        return '<rect x="64" y="108" width="28" height="40" fill="' + s + '"/><rect x="100" y="116" width="24" height="32" fill="' + a + '"/><circle cx="78" cy="124" r="3" fill="#f6efe2"/><circle cx="112" cy="130" r="3" fill="#f6efe2"/>';
      case 'recipe':
        return '<rect x="68" y="92" width="52" height="64" fill="#fbf6ec" stroke="' + s + '"/><path d="M78 110 h32 M78 122 h28 M78 134 h18" stroke="' + a + '" stroke-width="2"/>';
      case 'glitter':
        return '<rect x="76" y="100" width="32" height="46" rx="6" fill="' + s + '" opacity=".85"/><circle cx="86" cy="118" r="2" fill="#f6efe2"/><circle cx="98" cy="128" r="2" fill="' + a + '"/><circle cx="90" cy="136" r="1.5" fill="#f6efe2"/>';
      case 'thanks':
        return '<path d="M70 96 h36 l8 10 v40 h-44 z" fill="' + s + '"/><path d="M78 118 h24" stroke="#f6efe2" stroke-width="2" stroke-dasharray="2 2"/>';
      case 'table':
        return '<rect x="40" y="118" width="100" height="10" rx="2" fill="' + a + '"/><circle cx="62" cy="112" r="8" fill="' + s + '"/><rect x="82" y="100" width="16" height="16" fill="' + s + '"/><polygon points="112,116 120,96 128,116" fill="' + s + '"/>';
      default:
        return '<circle cx="90" cy="120" r="24" fill="' + s + '"/>';
    }
  }

  function feltDiorama(entry) {
    var ph = entry.placeholder || {};
    var swatch = ph.swatch || '#b24a55';
    var accent = ph.accent || '#1f4a38';
    var uid = esc(entry.dayId || 'scene');
    var lampSide = entry.dayId && entry.dayId.slice(-1) % 2 === 0 ? '78%' : '22%';
    return '' +
      '<svg class="diorama" viewBox="0 0 180 320" role="img" aria-hidden="true">' +
      '<defs><radialGradient id="lamp-' + uid + '" cx="' + lampSide + '" cy="0%" r="75%">' +
      '<stop offset="0" stop-color="#ffe1a8" stop-opacity=".95"/>' +
      '<stop offset="1" stop-color="#ffe1a8" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="180" height="320" fill="#f4e4cc"/>' +
      '<rect width="180" height="320" fill="url(#lamp-' + uid + ')"/>' +
      '<ellipse cx="90" cy="236" rx="74" ry="18" fill="#8a5340"/>' +
      '<ellipse cx="90" cy="230" rx="74" ry="14" fill="#a86a52"/>' +
      propMarkup(ph.motif, swatch, accent) +
      '<path d="M' + (30 + (entry.dayId ? entry.dayId.charCodeAt(5) % 20 : 8)) + ' 250 C 50 270, 40 286, 70 278" fill="none" stroke="' + esc(accent) + '" stroke-width="1.4" stroke-dasharray="2 3"/>' +
      '<rect x="14" y="14" width="152" height="292" fill="none" stroke="#7a5344" stroke-width="1.25" stroke-dasharray="3 4"/>' +
      '</svg>';
  }

  function feltMark(entry) {
    var ph = entry.placeholder || {};
    return '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="' + esc(ph.swatch || '#b24a55') + '"/><circle cx="16" cy="16" r="8" fill="none" stroke="#f6efe2" stroke-width="1.2" stroke-dasharray="2 2"/></svg>';
  }

  function feltFeature() {
    var dots = '';
    for (var i = 0; i < 25; i++) {
      var x = 18 + (i % 5) * 30;
      var y = 168 + Math.floor(i / 5) * 22;
      dots += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + (i % 2 ? '#8f3140' : '#1f4a38') + '"/>';
    }
    return '' +
      '<svg class="diorama feature-art" viewBox="0 0 180 320" aria-hidden="true">' +
      '<defs><radialGradient id="lamp-feature" cx="50%" cy="0%" r="70%">' +
      '<stop offset="0" stop-color="#ffe1a8" stop-opacity=".9"/>' +
      '<stop offset="1" stop-color="#ffe1a8" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="180" height="320" fill="#f4e4cc"/>' +
      '<rect width="180" height="320" fill="url(#lamp-feature)"/>' +
      '<ellipse cx="90" cy="250" rx="70" ry="16" fill="#8a5340"/>' +
      '<rect x="28" y="78" width="124" height="78" rx="8" fill="#fbf6ec" stroke="#7a5344" stroke-dasharray="3 3"/>' +
      dots +
      '<rect x="14" y="14" width="152" height="292" fill="none" stroke="#7a5344" stroke-width="1.25" stroke-dasharray="3 4"/>' +
      '</svg>';
  }

  return { feltDiorama: feltDiorama, feltMark: feltMark, feltFeature: feltFeature, propMarkup: propMarkup };
});
