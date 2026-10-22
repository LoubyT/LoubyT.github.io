/* demo-data.js — clearly FAKE sample data for demo mode (triple-tap the header; see demo-mode.js).
 * Made-up store-brand products and Ibotta offers; nothing here comes from, or is derived from, real order history.
 * In demo mode the encrypted usuals are never fetched or decrypted and nothing is saved on the phone. */
(function (root) {
  'use strict';
  var P = [
    ['D1001', 'Morning Stars Honey Oat Cereal, 14 oz', 'Morning Stars Cereal', 'morning stars', 'cereal', '14 oz', 2],
    ['D1002', 'Brightmeadow 2% Reduced Fat Milk, 1 gal', 'Brightmeadow 2% Milk', 'brightmeadow', 'milk', '1 gal', 2],
    ['D1003', 'Hillcrest Farms Large White Eggs, 18 ct', 'Hillcrest Eggs 18 ct', 'hillcrest', 'eggs', '18 ct', 1],
    ['D1004', 'Golden Crust Whole Wheat Bread, 20 oz', 'Golden Crust Wheat Bread', 'golden', 'bread', '20 oz', 2],
    ['D1005', 'Maple Lane Mild Cheddar Cheese Slices, 12 ct', 'Maple Lane Cheddar Slices', 'maple', 'cheese', '12 ct', 1],
    ['D1006', 'Cloudberry Strawberry Greek Yogurt, 4 pk', 'Cloudberry Greek Yogurt', 'cloudberry', 'yogurt', '4 pk', 2],
    ['D1007', 'Ridgeway Roasters Medium Roast Ground Coffee, 24 oz', 'Ridgeway Ground Coffee', 'ridgeway', 'coffee', '24 oz', 1],
    ['D1008', 'Bella Nonna Rotini Pasta, 16 oz', 'Bella Nonna Rotini', 'bella', 'pasta', '16 oz', 3],
    ['D1009', 'Crunchtown Sea Salt Tortilla Chips, 13 oz', 'Crunchtown Tortilla Chips', 'crunchtown', 'chips', '13 oz', 2],
    ['D1010', 'Snugglies Baby Diapers Size 4, 120 ct', 'Snugglies Diapers Size 4', 'snugglies', 'diapers', '120 ct', 1],
    ['D1011', 'TidyRoll Paper Towels, 6 Double Rolls', 'TidyRoll Paper Towels 6 pk', 'tidyroll', 'paper towels', '6 rolls', 1],
    ['D1012', 'Orchard Bloom 100% Apple Juice, 64 fl oz', 'Orchard Bloom Apple Juice', 'orchard', 'juice', '64 fl oz', 2],
  ];
  function usuals() {
    return P.map(function (p, i) {
      return { rank: i + 1, id: p[0], name: p[1], short: p[2], brand: p[3], category: p[4], size: p[5], trips: 12 - i, units: (12 - i) * p[6], typicalQty: p[6], price: 0, lastBought: '' };
    });
  }
  var prod = function (id) { var p = P.find(function (x) { return x[0] === id; }); return { id: p[0], short: p[2], url: '' }; };
  function deals() {
    var t = Date.now();
    var D = [
      { name: 'Morning Stars Cereal', amount: 1, store: 'walmart', product: prod('D1001'), mustBuy: 2, limit: 1, qty: 2 },
      { name: 'Brightmeadow Milk', amount: 0.75, store: 'walmart', product: prod('D1002'), mustBuy: 1, limit: 2, qty: 2 },
      { name: 'Crunchtown Tortilla Chips', amount: 1.5, store: 'walmart', product: prod('D1009'), mustBuy: 2, limit: 2, qty: 2, note: 'Any flavor' },
      { name: 'Snugglies Diapers', amount: 3, store: 'walmart', product: prod('D1010'), mustBuy: 1, limit: 1, qty: 1 },
      { name: 'Any brand bananas', amount: 0.25, store: 'walmart', mustBuy: 1, limit: 1, qty: 1 },
      { name: 'Cloudberry Greek Yogurt', amount: 0.5, store: 'walmart', product: prod('D1006'), mustBuy: 1, limit: 1, qty: 1, done: true },
      { name: 'Ridgeway Roasters Coffee', amount: 2, store: 'heb', mustBuy: 1, limit: 1, qty: 1 },
      { name: 'Any brand eggs', amount: 0.3, store: 'heb', mustBuy: 1, limit: 3, qty: 1, note: '18 ct or larger' },
    ];
    return D.map(function (d, i) { return Object.assign({ id: 'demo' + i, note: '', link: '', done: false, createdAt: t - i * 6e4, doneAt: d.done ? t : null }, d); });
  }
  root.DealsDemo = { usuals: usuals, deals: deals };
})(typeof window !== 'undefined' ? window : this);
