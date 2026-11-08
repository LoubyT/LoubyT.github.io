/* Sample story only. Fictional Holly House elves. Not a family plan.
 * December 1–25, 2026, original order. Clear the sample by importing a private seed.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ElfDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function day(n, spec) {
    return {
      id: 'day-' + (n < 10 ? '0' : '') + n,
      number: n,
      title: spec.title,
      description: spec.description,
      note: spec.note,
      setup: spec.setup || '',
      props: spec.props || '',
      arrival: spec.arrival || '',
      craftNote: spec.craft || '',
      isCraft: !!spec.craft,
      suggestedLeadDays: spec.lead == null ? null : spec.lead,
      suggestionReason: spec.reason || '',
      prep: (spec.prep || []).map(function (label, i) { return { id: 'd' + n + 'p' + (i + 1), label: label }; }),
      completion: (spec.done || []).map(function (label, i) { return { id: 'd' + n + 'c' + (i + 1), label: label }; })
    };
  }

  var days = [
    day(1, { title: 'Flour tracks', description: 'The toy car writes tracks through the flour. The donut was meant to survive the lap. It does not.', note: 'Flour on the table, donut in the lane, tracks where the car went.', props: 'Flour, donut, toy car', arrival: 'Pip', prep: ['Dust the table'], done: ['Leave the tracks'] }),
    day(2, { title: 'One bell short', description: 'Bramble swears the hall bell was here yesterday. It is under the cat.', note: 'Check under the cat before buying another bell.', props: 'Hall bell, one suspicious cat', arrival: 'Bramble', craft: 'Tie a new ribbon on the found bell.', lead: 1, reason: 'Ribbon the day before, if the cat allows. Suggested only.', prep: ['Apologize to the cat'] }),
    day(3, { title: 'Sock auditions', description: 'Every unmatched sock wants the speaking part. The navy one is a terrible singer and knows it.', note: 'Sock chorus. No names on the tags.', props: 'Three lonely socks', done: ['Pick the navy sock anyway'] }),
    day(4, { title: 'Birds in the window', description: 'Dot hangs felt birds where the lamp can see them. One bird faces the wrong way out of principle.', note: 'Window birds. Pale thread.', props: 'Felt birds, pale thread', arrival: 'Dot' }),
    day(5, { title: 'Tags for the cocoa', description: 'The cocoa tin gets a tag that says “for sharing,” which Pip interprets as a dare.', note: 'Cocoa tags. Short words.', props: 'Tags, cocoa tin', done: ['Letter three tags'] }),
    day(6, { title: 'A wreath of strangers', description: 'Buttons from lost coats become a wreath. None of them match, which is the point.', note: 'Button wreath. Sort by charm.', props: 'Mismatched buttons, felt ring', craft: 'Stitch the wreath.', lead: 2, reason: 'Gathering buttons takes longer than sewing. Suggested, not a deadline.', prep: ['Raid the button tin'] }),
    day(7, { title: 'Pebbles with opinions', description: 'Five stones get one word each. The smallest stone says “more biscuits.”', note: 'One word a stone.', props: 'Five smooth stones', done: ['Paint after they dry'] }),
    day(8, { title: 'Jam-jar moonlight', description: 'Clean jars, a pinch of salt, and paper collars. The kitchen smells like last summer.', note: 'Jars must be dry. Labels off.', props: 'Two jam jars, salt, paper collars', craft: 'Collar the jars after they dry.', lead: 1, reason: 'Wet glass sulks. Suggested dry time only.', prep: ['Soak the jars'] }),
    day(9, { title: 'Mitten theater', description: 'Two mittens bow, get stuck, and call it a play. The audience is a row of spoons.', note: 'Mitten theater. Spoons in the front row.', props: 'Two single mittens, spoons' }),
    day(10, { title: 'Moons on a plate', description: 'Salt-dough moons dry by the stove. One has a thumbprint and refuses to be fixed.', note: 'Bake low. Paint when cool.', props: 'Salt dough, ribbon', craft: 'Press the moons early so they can dry.', lead: 2, reason: 'Dough likes time. Suggested, not a deadline.', prep: ['Mix a small batch'] }),
    day(11, { title: 'Notes for a tiny sled', description: 'A paper sled no longer than a hand carries one kind sentence and immediately looks important.', note: 'One sentence. The sled is small.', props: 'Scrap card, one sentence' }),
    day(12, { title: 'Bells for the railing', description: 'The garland is for the railing on this Saturday. Pip wrote “Sunday” on the note and will not discuss it.', note: 'Sunday bell practice if the hall is quiet. The chapter stays on this page.', props: 'Felt bells, red thread', arrival: 'Pip', craft: 'Lay the bells out in a row.', lead: 1, reason: 'The sample note says Sunday. December 12 is a Saturday, and the chapter stays there. A guess, only a guess: practice the day before.', prep: ['Cut bell shapes'] }),
    day(13, { title: 'Popcorn on a string', description: 'The broken pieces are officially snacks. This is the only rule everyone keeps.', note: 'Eat the broken ones. That is the rule.', props: 'Plain popcorn, needle, string', prep: ['Pop a small bowl'] }),
    day(14, { title: 'Five small firs', description: 'Felt trees hold hands. The shortest one is placed in the middle, by vote.', note: 'Five is a forest.', props: 'Green felt triangles', craft: 'Cut the triangles ahead of the stitching hour.', lead: 1, reason: 'Suggested head start, not a deadline.', prep: ['Cut five triangles'] }),
    day(15, { title: 'Bookmarks for a quiet night', description: 'Two stitched bookmarks. One stays in the house, which feels only fair.', note: 'Make two. Keep one.', props: 'Stiff paper, gold thread' }),
    day(16, { title: 'Ribbons on the spice shelf', description: 'Loose bows, so dinner can still happen. The cinnamon jar looks fancy and knows it.', note: 'Loose knots.', props: 'Narrow ribbon, three jars' }),
    day(17, { title: 'A lane of little houses', description: 'A cereal box becomes a street with no addresses. The houses are shy.', note: 'Prick the windows. No addresses.', props: 'One cereal box', craft: 'A dry box folds more kindly the next day.', lead: 1, reason: 'Suggested, not a deadline.', prep: ['Save a cereal box'] }),
    day(18, { title: 'Wands from the ribbon tin', description: 'Star sequins are a luxury. Bramble uses one and immediately loses it to the cat.', note: 'One wand each. Sequins optional.', props: 'Short sticks, ribbon', arrival: 'The cat, again' }),
    day(19, { title: 'Cocoa coasters', description: 'Round felt coasters for the mugs. The note says Sunday. The page does not move.', note: 'Sunday cocoa stitches. Cut the circles earlier if you like. The chapter stays here.', props: 'Felt circles, cocoa-colored thread', craft: 'Cut the circles so stitching is the only job.', lead: 1, reason: 'The sample note says Sunday. December 19 is a Saturday. Nothing was moved. The earlier cut is a guess, not a deadline.', prep: ['Cut two circles'] }),
    day(20, { title: 'Potato stars', description: 'One potato prints a perfect star, then smears, then is forgiven and boiled.', note: 'Newspaper on the table. One potato is plenty.', props: 'Potato, cranberry paint, kraft paper', prep: ['Set down newspaper'] }),
    day(21, { title: 'Lamps for the step', description: 'Paper bags, a little sand, holes like constellations. Skip it if the wind is showing off.', note: 'Sand in the bottom. Wild nights are cancelled.', props: 'Paper bags, sand' }),
    day(22, { title: 'The recipe with a smudge', description: 'The cocoa recipe is copied by hand, smudge and all. The smudge is not a secret ingredient.', note: 'One recipe. Smudge may stay.', props: 'A recipe card' }),
    day(23, { title: 'Jars of quiet snow', description: 'A spoon of glitter, then the lid, then a firm talk about not being a roommate.', note: 'Lid on tight.', props: 'A small jar of fine glitter', craft: 'Find the glitter before the jars are filled.', lead: 1, reason: 'Suggested, not a deadline.', prep: ['Find the glitter'] }),
    day(24, { title: 'Thank-you, and that is all', description: 'Tags that say thank you and nothing else. Speeches are for people with bigger cards.', note: 'Two words. Stitch the border if the evening is kind.', props: 'Small tags', done: ['Letter four tags'] }),
    day(25, { title: 'The lantern walk', description: 'Everything made, and the gap where something was not, goes out together. The gap is invited.', note: 'Light the lamps. Leave a gap on purpose.', props: 'Every finished thing, one honest gap', arrival: 'The whole Holly House', done: ['Clear the table', 'Light the lamps'] })
  ];

  var shopping = [
    { id: 'shop-ribbon', name: 'Red ribbon', qtyNote: 'one spool', dayId: 'day-02', needDate: '2026-12-02', needBasis: 'date', state: 'owned', suggestionNote: '' },
    { id: 'shop-bells', name: 'Tiny bells', qtyNote: 'a handful', dayId: 'day-12', needDate: '2026-12-11', needBasis: 'suggestion', state: 'need', suggestionNote: 'Follows the sample guess for the bell garland. Not a deadline.' },
    { id: 'shop-felt', name: 'Cream and green felt', qtyNote: 'a small pack', dayId: 'day-04', needDate: '2026-12-04', needBasis: 'date', state: 'need', suggestionNote: '' },
    { id: 'shop-buttons', name: 'Extra buttons', qtyNote: 'only if the tin is thin', dayId: 'day-06', needDate: '2026-12-04', needBasis: 'date', state: 'owned', suggestionNote: '' },
    { id: 'shop-jars', name: 'Empty jam jars', qtyNote: 'two', dayId: 'day-08', needDate: '2026-12-07', needBasis: 'date', state: 'owned', suggestionNote: '' },
    { id: 'shop-salt', name: 'Salt for dough', qtyNote: 'from the ordinary box', dayId: 'day-10', needDate: '2026-12-08', needBasis: 'date', state: 'need', suggestionNote: '' },
    { id: 'shop-popcorn', name: 'Plain popcorn', qtyNote: 'one bag', dayId: 'day-13', needDate: '2026-12-13', needBasis: 'date', state: 'need', suggestionNote: '' },
    { id: 'shop-cocoa', name: 'Cocoa', qtyNote: 'the usual tin', dayId: 'day-19', needDate: '2026-12-18', needBasis: 'suggestion', state: 'bought', suggestionNote: 'Follows the sample guess for the coasters. Not a deadline.' },
    { id: 'shop-bags', name: 'Paper lunch bags', qtyNote: 'a few', dayId: 'day-21', needDate: '2026-12-21', needBasis: 'date', state: 'need', suggestionNote: '' },
    { id: 'shop-glitter', name: 'Fine glitter', qtyNote: 'the smallest jar', dayId: 'day-23', needDate: '2026-12-22', needBasis: 'date', state: 'need', suggestionNote: '' },
    { id: 'shop-thread', name: 'Spare cream thread', qtyNote: 'if the spool runs out', dayId: null, needDate: null, needBasis: 'none', state: 'need', suggestionNote: '' }
  ];

  return {
    raw: {
      defaultTitle: 'Elf HQ',
      demoName: '',
      sampleLabel: 'Sample story',
      recipients: [
        { id: 'sample-1', name: 'Recipient A' },
        { id: 'sample-2', name: 'Recipient B' },
        { id: 'sample-3', name: 'Recipient C' },
        { id: 'sample-4', name: 'Recipient D' }
      ],
      gifts: [
        { id: 'sample-gift-1', recipientId: 'sample-1', idea: 'Wool mittens', url: 'https://shop.example/mittens', variant: { size: 'M', color: 'red', model: '', pack: '' }, quantity: 1, notes: '', priority: 'normal', status: 'purchased', purchasedAt: '2026-11-02', spentCents: 1800, spentConfirmed: true, productRevision: 1, offer: null, history: [], deleted: false },
        { id: 'sample-gift-2', recipientId: 'sample-2', idea: 'Picture book', url: 'https://shop.example/book', variant: { size: '', color: '', model: 'hardcover', pack: '' }, quantity: 1, notes: '', priority: 'normal', status: 'planned', purchasedAt: null, spentCents: null, spentConfirmed: false, productRevision: 1, offer: { amountCents: 1299, sellerCount: 3, checkedAt: '2026-11-07T15:00:00Z', sourceUrl: 'https://shop.example/book', basis: 'exact-variant', shippingKnown: false, shippingCents: null, availability: 'in-stock', tax: 'unknown', membership: 'separate', promo: 'separate', condition: 'new', productRevision: 1, stale: false }, history: [], deleted: false },
        { id: 'sample-gift-3', recipientId: 'sample-3', idea: 'A cozy surprise', url: '', variant: { size: '', color: '', model: '', pack: '' }, quantity: 1, notes: '', priority: 'normal', status: 'idea', purchasedAt: null, spentCents: null, spentConfirmed: false, productRevision: 1, offer: null, history: [], deleted: false },
        { id: 'sample-gift-4', recipientId: 'sample-4', idea: 'Little red wagon', url: 'https://shop.example/wagon', variant: { size: '', color: 'red', model: 'wagon', pack: '' }, quantity: 1, notes: '', priority: 'high', status: 'planned', purchasedAt: null, spentCents: null, spentConfirmed: false, productRevision: 1, offer: { amountCents: 2400, sellerCount: 2, checkedAt: '2026-10-20T15:00:00Z', sourceUrl: 'https://shop.example/wagon', basis: 'exact-variant', shippingKnown: false, shippingCents: null, availability: 'in-stock', tax: 'unknown', membership: 'separate', promo: 'separate', condition: 'new', productRevision: 1, stale: true }, history: [], deleted: false }
      ],
      season: { id: 'december-2026', startDate: '2026-12-01', dayCount: 25, timeZone: 'America/Chicago' },
      days: days,
      shopping: shopping
    }
  };
});