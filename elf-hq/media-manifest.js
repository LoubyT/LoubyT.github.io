/* Daily media slots for a collaborator who may later film 25 distinct clips.
 * Nothing has been filmed. src stays null. Do not point two days at one file.
 * Encoding numbers are targets, not claims that a file exists.
 * Captions, dates, and names stay out of the picture. If a future clip contains
 * anything private, it does not belong in this public folder; it needs real
 * authenticated access.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfMedia = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var motifs = [
    ['stars', 'The paper stars lean left and nobody fixes them.'],
    ['pinecone', 'A felt pinecone rolls half an inch and stops, proud of itself.'],
    ['sock', 'A nameless sock stands up, then thinks better of it.'],
    ['birds', 'Three felt birds agree to migrate as far as the window.'],
    ['cocoa', 'A cocoa tag spins once on its thread and faces the wrong way.'],
    ['wreath', 'One button on the wreath is obviously from a coat.'],
    ['pebbles', 'Five pebbles line up, and the smallest one is in charge.'],
    ['lantern', 'A jam jar catches the lamp and pretends to be moonlight.'],
    ['mittens', 'Two mittens bow to each other and get stuck.'],
    ['moons', 'A salt-dough moon develops a thumbprint and keeps it.'],
    ['sled', 'A paper sled tries to be serious and immediately is not.'],
    ['bells', 'The middle bell is sewn on upside down and stays that way.'],
    ['popcorn', 'One piece of popcorn refuses to be threaded and is eaten.'],
    ['firs', 'The shortest felt fir is placed in the middle on purpose.'],
    ['bookmark', 'A bookmark stars itself and forgets which book it belongs to.'],
    ['spices', 'A ribbon bow slowly loosens, which is the whole plot.'],
    ['houses', 'A cardboard house gets a window, then a second, smaller one.'],
    ['wands', 'A ribbon wand droops, then is retied too tightly.'],
    ['coasters', 'Two coasters trade places when no one is looking.'],
    ['stamps', 'A potato star prints once, beautifully, and then smears.'],
    ['luminaries', 'A paper bag glows, hiccups, and keeps glowing.'],
    ['recipe', 'A recipe card gets one heroic smudge.'],
    ['glitter', 'Glitter snows upward for one second, which startles the jar.'],
    ['thanks', 'A thank-you tag is stitched almost straight.'],
    ['table', 'The long table leaves one gap, and the gap is the guest of honor.']
  ];

  var swatches = ['#b24a55', '#3e6b52', '#a67c3d', '#8f3140', '#2f6a50', '#c46b58', '#1f4a38', '#d08a4c', '#7d3b46', '#4e7a62'];

  var days = motifs.map(function (pair, i) {
    var n = i + 1;
    var id = 'day-' + (n < 10 ? '0' : '') + n;
    return {
      dayId: id,
      status: 'awaiting-film',
      filmed: false,
      src: null,
      poster: null,
      src480: null,
      gagToFilm: 'Chapter ' + n + ' has no filmed picture yet.',
      placeholder: {
        motif: pair[0],
        swatch: swatches[i % swatches.length],
        accent: swatches[(i + 3) % swatches.length],
        caption: 'Film coming soon'
      }
    };
  });
  days[0].standInIsFinal = false;
  days[0].restoring = 'flour, donut, car tracks';

  return {
    manifest: {
      direction: {
        look: 'Isolated elf, toy car, and household props. No kitchen backdrop.',
        palette: 'light green, warm red, a little snow',
        camera: 'Locked portrait, one readable gag, about 5 to 6 seconds.',
        characterChosen: false,
        characterNote: 'Character design is not chosen. Nothing in this app is approved character art.',
        privacy: 'Do not burn dates, captions, or names into the picture. Private pictures need authenticated access, not a hidden public file.'
      },
      encoding: {
        container: 'mp4',
        videoCodec: 'avc1',
        audio: 'none',
        mutedFile: true,
        fastStart: true,
        width: 720,
        height: 1280,
        fps: 24,
        durationSecMin: 5,
        durationSecMax: 6,
        poster: ['image/webp', 'image/jpeg'],
        optionalSmaller: { width: 480, height: 854, note: 'Optional 480-wide portrait, same picture, still muted.' }
      },
      composition: {
        subject: 'isolated elf, toy car, and real household props',
        backdrop: 'none',
        cssRemovesBackground: false,
        pixelKeying: false,
        crop: false,
        safePadding: 'Hats and the car stay fully inside the frame.',
        place: 'above the chapter words',
        plate: '#E8F2E5',
        alphaCandidates: [
          { container: 'webm', codec: 'vp9', alphaDeclared: true, playsOn: 'chromium' },
          { container: 'mp4', codec: 'hvc1', alphaDeclared: true, playsOn: 'safari' }
        ],
        opaqueFallback: { container: 'mp4', codec: 'avc1', alphaDeclared: false, note: 'An ordinary MP4 stays opaque. The page plate matches it. CSS does not erase its background.' }
      },
      playback: {
        playsinline: true,
        muted: true,
        preload: 'none',
        onlyVisibleDay: true,
        reducedMotion: 'poster until an explicit play',
        saveData: 'poster until an explicit play',
        sound: 'App chimes are separate and off until someone turns them on. Video files stay muted.'
      },
      production: {
        started: false,
        assetsOnDisk: 0,
        costsResolved: false
      },
      days: days,
      feature: {
        id: 'whole-story',
        kind: 'feature',
        distinctFromDaily: true,
        title: 'Watch the whole story',
        covers: 'all-25-chapters',
        status: 'unavailable',
        filmed: false,
        rendered: false,
        src: null,
        poster: null,
        captions: null,
        phoneSrc: null,
        basedOnRevision: 0,
        master: {
          orientation: 'portrait',
          phoneEncode: true,
          note: 'A portrait master is allowed, plus a smaller phone encode of the same film. Runtime is not fixed.'
        },
        runtimeLocked: false,
        dateLock: false,
        playback: {
          autoplay: false,
          preload: 'none',
          controls: true,
          playsinline: true,
          captions: true
        },
        access: 'authenticated-private',
        placeholderCaption: 'The whole-story film is not ready. This is an empty seat, not a rendered picture.'
      }
    }
  };
});
