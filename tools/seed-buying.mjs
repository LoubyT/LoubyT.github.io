// Seed the private Buying list on https://www.louby.net/elf-hq/
// The spreadsheet stays on this machine. Nothing in this file is a gift.
//
//   npm install playwright
//   npx playwright install chromium
//   ELF_HQ_PIN=.... BUYING_CSV=./saved-for-later.csv node tools/seed-buying.mjs

import fs from 'fs';

const pin = process.env.ELF_HQ_PIN || '';
const csvPath = process.env.BUYING_CSV || '';

if (!/^\d{4}$/.test(pin)) {
  console.error('Set ELF_HQ_PIN to the household PIN.');
  process.exit(1);
}
if (!csvPath) {
  console.error('Set BUYING_CSV to the spreadsheet.');
  process.exit(1);
}

let table;
try {
  table = parseCsv(fs.readFileSync(csvPath, 'utf8'));
} catch (err) {
  console.error('Could not read BUYING_CSV.');
  process.exit(1);
}

const items = rowsToItems(table);
if (!items.length) {
  console.error('The spreadsheet had no usable rows.');
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  console.error('Install Playwright first: npm install playwright && npx playwright install chromium');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let exitCode = 0;

function fail(message) {
  console.error(message);
  exitCode = 1;
  const stop = new Error('stop');
  stop.printed = true;
  throw stop;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i += 1; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((line) => line.some((cell) => String(cell).trim()));
}

function dollars(value) {
  const text = String(value == null ? '' : value).trim().replace(/^\$/, '');
  if (!text) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number(((match[2] || '') + '00').slice(0, 2));
}

function couponCents(deal) {
  const match = /clip \$?(\d+(?:\.\d{1,2})?) coupon/i.exec(String(deal || ''));
  if (!match) return 0;
  return dollars(match[1]) || 0;
}

function rowsToItems(rows) {
  if (!rows.length) return [];
  const head = rows[0].map((cell) => String(cell).trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const orderAt = col('priority_order');
  const titleAt = col('title');
  const priceAt = col('price_11_19') >= 0 ? col('price_11_19') : col('price');
  const listAt = col('list_price');
  const dealAt = col('deal');
  const variantAt = col('variant');
  const urlAt = col('url');
  const noteAt = col('note');
  if (titleAt < 0 || priceAt < 0 || urlAt < 0) return [];
  const items = [];
  const seen = {};
  rows.slice(1).forEach((cells) => {
    const url = String(cells[urlAt] || '').trim();
    const asin = /\/dp\/([A-Za-z0-9]{10})/.exec(url);
    if (!asin) return;
    const id = 'buy-' + asin[1];
    if (seen[id]) return;
    seen[id] = true;
    const order = orderAt >= 0 ? Number(cells[orderAt]) : items.length + 1;
    const deal = dealAt >= 0 ? String(cells[dealAt] || '').trim() : '';
    const note = noteAt >= 0 ? String(cells[noteAt] || '').trim() : '';
    const friday = /black friday/i.test(deal) || /buy black friday/i.test(note) || (order >= 1 && order <= 4);
    const price = dollars(cells[priceAt]);
    if (price == null) return;
    items.push({
      id: id,
      order: order,
      title: String(cells[titleAt] || '').trim(),
      priceCents: price,
      listCents: listAt >= 0 ? dollars(cells[listAt]) : null,
      deal: deal,
      couponCents: couponCents(deal),
      variant: variantAt >= 0 ? String(cells[variantAt] || '').trim() : '',
      url: url,
      note: note,
      timing: friday ? 'bf' : 'later',
      bought: false,
      removed: false
    });
  });
  return items;
}

try {
  await page.goto('https://www.louby.net/elf-hq/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.elf-pad button', { timeout: 20000 });
  const unlocked = await page.evaluate(async (code) => {
    const pad = document.querySelector('.elf-pad');
    if (!pad) return 'no-pad';
    for (const digit of code) {
      const button = Array.from(pad.querySelectorAll('button')).find((node) => node.textContent === digit);
      if (!button) return 'no-key';
      button.click();
    }
    const started = Date.now();
    while (Date.now() - started < 20000) {
      if (!document.documentElement.classList.contains('needs-pin')) return 'open';
      const msg = document.querySelector('.elf-msg');
      const text = msg ? msg.textContent : '';
      if (text) return 'refused';
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 'timeout';
  }, pin);
  if (unlocked !== 'open') fail('The lock did not open.');

  await page.waitForFunction(() => typeof window.elfSeedBuying === 'function', { timeout: 20000 });
  await page.waitForFunction(() => {
    const dot = document.querySelector('#syncDot');
    return dot && dot.getAttribute('aria-label') === 'Synced';
  }, { timeout: 30000 });

  const seeded = await page.evaluate(async (data) => {
    return window.elfSeedBuying(data);
  }, items);

  await page.waitForFunction(() => {
    const dot = document.querySelector('#syncDot');
    const label = dot ? dot.getAttribute('aria-label') : '';
    return label === 'Synced' || label === 'Needs a look';
  }, { timeout: 120000 });
  const label = await page.getAttribute('#syncDot', 'aria-label');
  if (label !== 'Synced') fail('Sync did not settle. The list was not confirmed.');

  await page.locator('a[data-tab="gifts"]').click();
  await page.locator('.buy-left').waitFor({ timeout: 15000 });
  const total = await page.locator('.buy-left').innerText();
  const before = await page.locator('.buy-pre').innerText();
  console.log(JSON.stringify({
    added: seeded.added,
    present: seeded.present,
    left: total,
    beforeTax: before
  }));
} catch (err) {
  if (!err || !err.printed) {
    const message = err && err.message ? err.message : '';
    const known = ['locked', 'not-synced', 'conflict', 'catalog'].find((code) => message.indexOf(code) !== -1);
    console.error(known || 'seed failed');
    exitCode = 1;
  }
} finally {
  await browser.close();
}
process.exit(exitCode);
