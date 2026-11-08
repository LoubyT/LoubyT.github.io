/* Blank chapters for a story the author will write.
 * No plot, no names, no prices. December 1–25, 2026, in that order.
 * Pictures are not locked to those dates. Prep dates stay separate.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var days = [];
  for (var n = 1; n <= 25; n++) {
    days.push({
      id: 'day-' + (n < 10 ? '0' : '') + n,
      number: n,
      title: '',
      description: '',
      note: '',
      setup: '',
      props: '',
      arrival: '',
      craftNote: '',
      isCraft: false,
      suggestedLeadDays: null,
      suggestionReason: '',
      prep: [],
      completion: []
    });
  }

  return {
    raw: {
      defaultTitle: 'Elf HQ',
      season: {
        id: 'december-2026',
        startDate: '2026-12-01',
        dayCount: 25,
        timeZone: 'America/Chicago'
      },
      days: days,
      shopping: []
    }
  };
});
