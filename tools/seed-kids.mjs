// Seed the private Kids list on https://www.louby.net/elf-hq/
// The catalog stays on this machine. Nothing in this file is gift data.
//
//   npm install playwright
//   npx playwright install chromium
//   ELF_HQ_PIN=.... KIDS_JSON=./kids-list.json node tools/seed-kids.mjs

import fs from 'fs';

const pin = process.env.ELF_HQ_PIN || '';
const jsonPath = process.env.KIDS_JSON || '';

if (!/^\d{4}$/.test(pin)) {
  console.error('Set ELF_HQ_PIN to the household PIN.');
  process.exit(1);
}
if (!jsonPath) {
  console.error('Set KIDS_JSON to the catalog file.');
  process.exit(1);
}

let catalog;
try {
  catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (err) {
  console.error('Could not read KIDS_JSON.');
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
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
let exitCode = 0;

function fail(message) {
  console.error(message);
  exitCode = 1;
  const stop = new Error('stop');
  stop.printed = true;
  throw stop;
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

  await page.waitForFunction(() => typeof window.elfSeedKids === 'function', { timeout: 20000 });
  await page.waitForFunction(() => {
    const dot = document.querySelector('#syncDot');
    return dot && dot.getAttribute('aria-label') === 'Synced';
  }, { timeout: 30000 });

  const seeded = await page.evaluate(async (data) => {
    return window.elfSeedKids(data);
  }, catalog);

  await page.waitForFunction(() => {
    const dot = document.querySelector('#syncDot');
    const label = dot ? dot.getAttribute('aria-label') : '';
    return label === 'Synced' || label === 'Needs a look';
  }, { timeout: 120000 });
  const label = await page.getAttribute('#syncDot', 'aria-label');
  if (label !== 'Synced') fail('Sync did not settle. The list was not confirmed.');

  await page.locator('a[data-tab="gifts"]').click();
  await page.locator('[data-act="gift-mode"][data-mode="kids"]').click();
  await page.locator('.kids-total').waitFor({ timeout: 15000 });
  const total = await page.locator('.kids-total').innerText();
  console.log(JSON.stringify({
    added: seeded.added,
    present: seeded.present,
    total: total
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
