/* Private cross-device sync is chosen and not built.
 *
 * This browser must not pretend IndexedDB or localStorage is a shared shelf.
 * This file never calls fetch. Wiring a base URL does not turn sync on.
 *
 * Simplest secure fit, after an explicit yes, and without a new paid service:
 * The budget apps already depend on a private server that is not in this public
 * repo (a Vercel relay that checks their PIN and returns a decryption key).
 * Do not reuse that PIN, and do not reuse their encrypted files. A 4-digit PIN
 * compiled into this site is not the login. Elf HQ should get its own route
 * on that same private server only if the current plan can store one household
 * document plus inspiration photos without a paid upgrade. Someone has to look
 * at that project's dashboard and say so before any route is added.
 *
 * When that exists, the shape is:
 * - WebAuthn passkey, server-side session cookie (HttpOnly, Secure, SameSite).
 * - GET/PUT the plan with If-Match on content revision. Same-field edits on
 *   two phones return both copies. The merge helper in plan-model.js is the
 *   rule: a quiet overwrite is a bug.
 * - Photo bytes are a separate authenticated request, Cache-Control: private,
 *   never a file in this public repo.
 * - Felt films with no names, dates, faces, or home details may later be
 *   ordinary public files in elf-hq/media/. Anything private in a frame uses
 *   the authenticated route instead. A UI gate in front of a public URL is
 *   not access control.
 *
 * Until then the rehearsal notebook (scratchpad.js) is one browser, labeled
 * as such, and export is the only copy that can move.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SYNC_IMPLEMENTED = false;

  var SUMMARY = [
    'Private sync is the plan, and it is not connected.',
    'Edits and pictures stay in this browser’s rehearsal notebook.',
    'They are not sent anywhere, and they are not written into the budget apps.',
    'A scene reader will be able to look, and will not be able to rewrite a chapter.',
    'The whole-story film uses that same private shelf. No film is loaded from here.',
    'If two phones someday change the same sentence, Elf HQ will ask which to keep.',
    'A backup file is the way to carry a copy until a private shelf exists.'
  ];

  function refuse(method) {
    var err = new Error('Private sync is not configured (' + method + '). Nothing was sent.');
    err.code = 'not-configured';
    return Promise.reject(err);
  }

  function createSyncPort(config) {
    void config;
    return {
      id: 'private-sync',
      implemented: SYNC_IMPLEMENTED,
      configured: false,
      shared: false,
      async status() {
        return {
          state: 'not-configured',
          shared: false,
          uploads: false,
          implemented: false,
          summary: SUMMARY.slice()
        };
      },
      pull: function () { return refuse('pull'); },
      push: function () { return refuse('push'); },
      putPhoto: function () { return refuse('putPhoto'); },
      getPhoto: function () { return refuse('getPhoto'); }
    };
  }

  return {
    SYNC_IMPLEMENTED: SYNC_IMPLEMENTED,
    SUMMARY: SUMMARY,
    createSyncPort: createSyncPort
  };
});
