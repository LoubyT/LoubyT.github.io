/* Smart coupon -> Walmart product matcher.
 * Maps an Ibotta offer (name, size note, offer details) to the exact product the family
 * usually buys, using data/usuals.json (built from real Walmart order history).
 * 100% local and offline. An optional AI hook (DealMatch.aiAssist) can be plugged in later
 * for fuzzy cases; it is never required.
 * Works in the browser (window.DealMatch) and in Node (module.exports) for tests. */
(function (root) {
  'use strict';

  const AUTO = 0.7;               // >= AUTO: auto-fill the product. Below: one-tap picker.
  const PICKS_KEY = 'deals.picks'; // remembered choices: { couponKey: { id, short, url } | { search: true } }

  /* ---------- text helpers ---------- */
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/[™®©]/g, '').replace(/\(r\)|\(tm\)/g, '')
    .replace(/&/g, ' and ').replace(/['’`]/g, '')
    .replace(/[^a-z0-9%.]+/g, ' ').replace(/(^|\s)\.+|\.+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const stem = (w) => w.length > 4 && /ies$/.test(w) ? w.slice(0, -3) + 'y'
    : w.length > 3 && /(?<![su])s$/.test(w) ? w.slice(0, -1) : w;
  const STOP = new Set(('a an and or the of for with in on to by from any brand variety varieties size sizes select see ' +
    'offer details only all new original classic family value pack count ct oz fl lb lbs each bag box bottle jar can cup ' +
    'tub carton container package pouch kids snacks gluten free organic natural fresh premium quality made real').split(' '));
  const tokens = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w) && !/^\d+(\.\d+)?%?$/.test(w) || /^\d%$/.test(w)).map(stem);

  /* ---------- brands ---------- */
  // Multi-word brands seen in the order history (and common Ibotta ones). Others default to the first word.
  const MULTI = ['oak farms', 'great value', 'simply', 'marketside', 'nature raised farms', 'plum organics', 'pure life',
    'black and white', 'top job', 'new york bakery', 'oscar mayer', 'annie chuns', 'freshness guaranteed', 'mt olive',
    'bar keepers friend', 'king arthur', 'spring tree', 'spectrum naturals', 'blue ribbon classics', 'taste of nature',
    'natures own', 'natures bakery', 'late july', 'sky organics', 'siete', 'head and shoulders', 'old spice',
    'traditional medicinals', 'florida crystals', 'spice world', 'concord foods', 'authentic asia', 'mountain dew',
    'the honest company', 'del monte', 'fruity pebbles', 'cinnamon toast crunch', 'lucky charms', 'frito lay', 'jacks',
    'bear', 'oui by yoplait', 'nestle toll house', 'nature sweet', 'naturesweet', 'brightfarms', 'filtrete', 'ortho',
    'blue bell', 'hill country fare', 'h e b', 'heb', 'coca cola', 'dr pepper', 'blue diamond', 'kerrygold', 'tillamook',
    'land o lakes', 'horizon organic', 'fairlife', 'borden', 'prairie farms', 'ben and jerrys', 'haagen dazs', 'nature valley',
    'quaker', 'kind', 'dole', 'chiquita', 'sun maid', 'cal organic', 'grimmway farms', 'tostitos', 'doritos', 'lays'];
  const GENERIC_FIRST = new Set(('any fresh organic green red white yellow sweet whole california seedless pork beef chicken ' +
    'minced toilet popcorn hot produce ground large small mini select frozen sliced bagged bananas banana grapes ' +
    'milk eggs butter bread cheese').split(' '));
  function brandOf(name) {
    const n = norm(name).replace(/^\(?\d+ pack\)? /, '').replace(/^hot /, '');
    if (/^any brand\b/.test(n)) return '';
    const multi = MULTI.filter((b) => n === b || n.startsWith(b + ' ')).sort((a, b) => b.length - a.length)[0];
    if (multi) return multi;
    const first = n.split(' ')[0] || '';
    return GENERIC_FIRST.has(first) || /^\d/.test(first) ? '' : first;
  }

  /* ---------- categories (what kind of product it is) ----------
   * Order matters: specific phrases first ("peanut butter" before "butter", "grape juice" before "grapes"). */
  const CATS = [
    ['peanut butter', /\bpeanut butter\b/], ['chocolate chips', /\b(milk )?chocolate (baking )?chips\b|\bbaking chips\b/],
    ['ice cream', /\bice cream\b|\bfrozen dessert\b|\bitalian ice\b|\btreat bars?\b|\bpopsicles?\b|\bgelato\b/],
    ['yogurt', /\byog(h)?urts?\b/], ['cottage cheese', /\bcottage cheese\b/], ['sour cream', /\bsour cream\b/],
    ['cream', /\b(heavy )?whipping cream\b|\bheavy cream\b|\bhalf and half\b|\bcoffee creamer\b|\bcreamer\b/],
    ['juice', /\bjuices?\b(?! from concentrate)/], ['lemonade', /\blemonade\b/],
    ['sports drink', /\bgatorade\b|\bpowerade\b|\bthirst quencher\b|\belectrolyte\b|\bsports? drinks?\b|\bbodyarmor\b/],
    ['coffee', /\bcoffee\b|\bespresso\b|\bcold brew\b|\blatte\b|\bmacchiato\b/],
    ['soda', /\bsoda\b|\bcola\b|\bsoft drinks?\b|\bmountain dew\b|\bdr pepper\b|\bsprite\b/],
    ['water', /\b(purified|drinking|spring|sparkling) water\b|\bpure life\b/],
    ['milk', /\bmilk\b(?! chocolate)/],
    ['butter', /\bbutter\b(?! tastin)/], ['eggs', /\beggs?\b/],
    ['baked goods', /\bbaked goods\b|\bcinnamon rolls?\b|\bbiscuits?\b(?!.*belvita)|\bcrescents?\b|\bpastry\b|\bpastries\b|\btoaster strudel\b|\bpie crusts?\b|\bcookie dough\b|\bdough\b|\bpizza rolls\b/],
    ['bread', /\bbread\b|\bbuns\b|\bnaan\b|\btexas toast\b|\btortillas\b|\bbagels?\b/],
    ['mac and cheese', /\bmac and cheese\b|\bmacaroni\b|\bshells and\b/],
    ['cheese', /\bcheese\b(?! crisps)|\bmozzarella\b|\bcheddar\b(?! weather)|\bbabybel\b/],
    ['grapes', /\bgrapes\b|\btable grapes?\b/], ['tomatoes', /\btomato(es)?\b(?! (and|pasta|sauce))/],
    ['bananas', /\bbananas?\b/], ['apples', /\bapples?\b/], ['berries', /\bstrawberr|\braspberr|\bblueberr|\bblackberr/],
    ['citrus', /\boranges?\b|\bmandarins?\b|\blemons\b|\blimes?\b|\bclementines?\b/],
    ['ground beef', /\bground beef\b/], ['bacon', /\bbacon\b/], ['hot dogs', /\bhot dogs?\b|\bwieners?\b|\bfranks\b/],
    ['chicken', /\bchicken\b(?! in gravy)/], ['jerky', /\bjerky\b|\bchomplings\b|\bmeat sticks?\b/],
    ['pasta sauce', /\bpasta sauce\b|\bspaghetti sauce\b|\bmarinara\b/], ['pasta', /\bpasta\b|\bangel hair\b|\bspaghetti\b|\bnoodles?\b/],
    ['cereal', /\bcereal\b|\bpebbles\b|\bfroot loops\b|\bcheerios\b/],
    ['chips', /\bchips\b|\bdoritos\b|\btostitos\b|\bfritos?\b|\blays\b|\bpringles\b/],
    ['cookies', /\bcookies?\b|\bwafers\b|\bgraham\b|\bfig bars\b|\boreos?\b/],
    ['crackers', /\bcrackers?\b|\bcheese crisps\b|\bparmcrisps\b|\bwhisps\b/],
    ['popcorn', /\bpopcorn\b|\bdrizzlecorn\b/], ['fruit snacks', /\bfruit snacks\b|\bfruit bites\b|\bfruit cups?\b|\bfruit bowls\b/],
    ['pizza', /\bpizza\b(?! rolls)/], ['salsa and dips', /\bsalsa\b|\bdip\b|\bguacamole\b|\bhummus\b/],
    ['diapers', /\bdiapers?\b/], ['wipes', /\bwipes\b|\bflushables\b/], ['paper towels', /\bpaper towels?\b/],
    ['toilet paper', /\btoilet paper\b|\bbath tissue\b/], ['tissues', /\bfacial tissues?\b|\bkleenex\b/],
    ['trash bags', /\btrash bags?\b|\bgarbage bags?\b/], ['laundry', /\blaundry\b|\bdetergent\b(?!.*dish)/],
    ['dish soap', /\bdish soap\b|\bdishwasher\b|\bdish detergent\b/], ['dog food', /\bdog food\b|\bdog chow\b/],
    ['cat food', /\bcat food\b|\bcat chow\b/],
    // Produce and pantry staples (matter for "Any Brand ..." offers)
    ['cucumbers', /\bcucumbers?\b/], ['peppers', /\bbell peppers?\b/], ['corn', /\bcorn on the cob\b|\bsweet corn\b|\bkernel corn\b/],
    ['celery', /\bcelery\b/], ['carrots', /\bcarrots?\b/], ['lettuce', /\blettuce\b|\bspring mix\b|\bsalad\b|\bkale\b/],
    ['potatoes', /\bpotato(es)?\b/], ['onions', /\bonions?\b/], ['avocados', /\bavocados?\b/],
    ['melons', /\bcantaloupe\b|\bwatermelon\b|\bhoneydew\b/], ['peaches', /\bpeach(es)?\b/], ['kiwi', /\bkiwi\b/],
    ['beans', /\bbeans?\b|\bchick peas\b|\bgarbanzos?\b/], ['pumpkin', /\bpumpkin\b(?! spice)/],
    ['frozen meals', /\bfrozen dinner\b|\btaquitos\b|\bnoodle bowl\b/], ['salmon', /\bsalmon\b/], ['shrimp', /\bshrimp\b/],
    ['pork', /\bpork\b/], ['flour', /\bflour\b/], ['sugar', /\bsugar\b/],
  ];
  function categoryOf(name) {
    const n = norm(name);
    for (const [c, re] of CATS) if (re.test(n)) return c;
    return '';
  }

  /* ---------- variants that must not be mixed up (whole vs 2% milk, salted vs unsalted) ---------- */
  const VARIANTS = {
    milk: [['whole', /\bwhole\b|vitamin d/], ['2%', /\b2%|reduced fat/], ['1%', /\b1%|low ?fat/], ['skim', /\bskim\b|fat free|nonfat/],
      ['chocolate', /chocolate/], ['lactose free', /lactose free/]],
    butter: [['unsalted', /unsalted/], ['salted', /\bsalted\b/]],
    'ground beef': [['80', /\b80%|80 20/], ['85', /\b85%|85 15/], ['90', /\b90%|90 10/], ['93', /\b93%|93 7/], ['96', /\b96%/]],
    eggs: [['brown', /brown/], ['white', /white/]],
  };
  function variantOf(cat, name) {
    const v = VARIANTS[cat]; if (!v) return '';
    const n = norm(name);
    const hit = v.find(([, re]) => re.test(n));
    return hit ? hit[0] : '';
  }

  /* ---------- sizes ----------
   * Returns { floz:[], oz:[], ct:[] } so "Gallon" == 128 fl oz, "1 lb" == 16 oz, "18 pk" == 18 ct. */
  function sizesOf(text) {
    const s = String(text || '').toLowerCase().replace(/(\d)\s*0z\b/g, '$1 oz');
    const out = { floz: [], oz: [], ct: [] };
    const num = '(\\d+(?:\\.\\d+)?)';
    for (const m of s.matchAll(new RegExp(num + '\\s*-?\\s*fl\\.?\\s*oz', 'g'))) out.floz.push(+m[1]);
    for (const m of s.matchAll(new RegExp(num + '\\s*-?\\s*oz\\b', 'g'))) {
      const before = s.slice(Math.max(0, m.index - 1), m.index + m[0].length);
      if (!/fl\.?\s*oz/.test(s.slice(m.index, m.index + m[0].length + 4)) && !/fl/.test(before)) out.oz.push(+m[1]);
    }
    for (const m of s.matchAll(new RegExp(num + '\\s*-?\\s*(lb|lbs)\\b', 'g'))) out.oz.push(+m[1] * 16);
    if (/\bhalf[ -]gallon\b/.test(s)) out.floz.push(64);
    else if (/(^|[^\d\s]\s*|\b1\s*)gallon\b/.test(s) && !/\d+\s*gallon/.test(s.replace(/\b1\s*gallon/, ''))) out.floz.push(128);
    if (/\bquart\b/.test(s)) out.floz.push(32);
    if (/\bpint\b/.test(s)) out.floz.push(16);
    for (const m of s.matchAll(/(\d+)\s*-?\s*(ct|count|pk|pack|rolls|sticks|bars|cups|cans|bottles)\b/g)) out.ct.push(+m[1]);
    for (const m of s.matchAll(/\b(?:pack|box|case) of (\d+)/g)) out.ct.push(+m[1]);
    return out;
  }
  const hasSize = (z) => z && (z.floz.length || z.oz.length || z.ct.length);
  /** +1 match, -1 clear mismatch, 0 unknown. */
  function sizeFit(want, have) {
    if (!hasSize(want) || !hasSize(have)) return 0;
    let shared = 0, ok = 0;
    for (const k of ['floz', 'oz', 'ct']) {
      if (!want[k].length || !have[k].length) continue;
      shared++;
      if (want[k].some((w) => have[k].some((h) => Math.abs(w - h) <= Math.max(0.2, w * 0.03)))) ok++;
    }
    if (!shared) return 0;
    return ok === shared ? 1 : ok ? 0 : -1;
  }

  /** Short display name: "Brand Whole Milk, Gallon". */
  function shortName(name) {
    const clean = String(name).replace(/\([^)]*\)/g, '').replace(/[™®]/g, '').replace(/\s+/g, ' ').trim();
    const parts = clean.split(/\s*,\s*/).filter(Boolean);
    let head = parts.shift() || clean;
    const sizeRe = /\d.*\b(oz|ct|count|lb|lbs|rolls|pack|pk|sheets|bags)\b|\b(gallon|half gallon|pint|quart|each|1ea)\b/i;
    while (parts.length && norm(head) === brandOf(head) && !sizeRe.test(parts[0])) head += ' ' + parts.shift();
    const size = parts.find((p) => sizeRe.test(p));
    if (size && !sizeRe.test(head)) head += ', ' + size.replace(/\s*bottle$/i, '');
    return head.length > 64 ? head.slice(0, 61).replace(/\s\S*$/, '') + '…' : head;
  }

  /* ---------- offer details: "includes / excludes the following" bullets ---------- */
  function offerLists(details) {
    const d = String(details || '');
    const grab = (re) => {
      const m = d.match(re); if (!m) return [];
      const rest = d.slice(m.index + m[0].length);
      // Bullets start with •, «, * or ·; wrapped lines are joined back onto their bullet.
      const parts = /(^|\n)\s*[•«*·-]\s+/.test(rest) ? rest.split(/(?:^|\n)\s*[•«*·-]\s+/) : rest.split('\n');
      return parts.map((x) => x.replace(/\s*\n\s*/g, ' ').trim())
        .filter((x) => x && !/^(this purchase|offer must|offer valid|\[|check product|available)/i.test(x))
        .slice(0, 20);
    };
    const cut = (arr) => { const i = arr.findIndex((x) => /cannot be combined|must be added/i.test(x)); return i >= 0 ? arr.slice(0, i) : arr; };
    return {
      include: cut(grab(/includes? the following:?/i)),
      exclude: cut(grab(/excludes? the following:?/i)),
    };
  }

  /* ---------- catalog ---------- */
  let usuals = [];
  let ready = null;
  function prep(u) {
    return Object.assign({}, u, {
      _brand: u.brand != null ? u.brand : brandOf(u.name),
      _cat: u.category != null ? u.category : categoryOf(u.name),
      _tok: new Set(tokens(u.name)),
      _size: sizesOf(u.name),
    });
  }
  function setUsuals(list) { usuals = (list || []).map(prep); return usuals; }
  function load(url) {
    // louby.net/savings: the usuals arrive decrypted in memory after the PIN (savings-boot.js), never as a public file
    if (!ready && !url && root.__dealUsuals) { const list = root.__dealUsuals; root.__dealUsuals = null; ready = Promise.resolve(setUsuals(list)); }
    if (!ready) {
      ready = fetch(url || 'data/usuals.json').then((r) => r.ok ? r.json() : { items: [] })
        .then((j) => setUsuals(j.items || j.usuals || [])).catch(() => setUsuals([]));
    }
    return ready;
  }

  /* ---------- remembered picks ---------- */
  function couponKey(c) {
    return norm(c.name).replace(/^any brand /, '').replace(/\b(any|select) (variety|varieties|size|sizes|flavor)\b/g, '').replace(/\s+/g, ' ').trim()
      + (c.note ? '|' + norm(c.note) : '');
  }
  const memStore = { m: {}, getItem(k) { return k in this.m ? this.m[k] : null; }, setItem(k, v) { this.m[k] = String(v); } };
  function store() { if (root.__dealDemo) return memStore; try { return root.localStorage || null; } catch { return null; } } // demo: in memory only
  function getPicks() { try { return JSON.parse(store().getItem(PICKS_KEY)) || {}; } catch { return {}; } }
  function remember(coupon, product) {
    const s = store(); if (!s) return;
    const p = getPicks();
    p[couponKey(coupon)] = product ? { id: product.id, short: product.short, url: product.url, at: Date.now() } : { search: true, at: Date.now() };
    try { s.setItem(PICKS_KEY, JSON.stringify(p)); } catch {}
  }
  function forget(coupon) { const s = store(); if (!s) return; const p = getPicks(); delete p[couponKey(coupon)]; try { s.setItem(PICKS_KEY, JSON.stringify(p)); } catch {} }

  /* ---------- scoring ---------- */
  const pub = (u) => u && { id: u.id, name: u.name, short: u.short || shortName(u.name), url: u.url, size: u.size, trips: u.trips, typicalQty: u.typicalQty };

  /**
   * coupon: { name, note?, details? }  (note = size hint like "12 fl oz/18 pk"; details = offer fine print)
   * returns { product|null, confidence 0..1, auto, candidates:[{product, score, why}], reason, brand, category }
   */
  function match(coupon) {
    const text = String(coupon.name || '');
    const brand = brandOf(text);
    const generic = !brand;
    const cat = categoryOf(text) || categoryOf(coupon.details || '');
    const variant = variantOf(cat, text);
    const lists = offerLists(coupon.details);
    const anySize = /any size/i.test(text + ' ' + (coupon.details || '')) && !coupon.note;
    const want = anySize ? null : sizesOf([coupon.note, ...lists.include].filter(Boolean).join(' ; '));
    const brandTok = new Set(tokens(brand));
    const ctok = tokens(text).filter((t) => !brandTok.has(t));
    const res = { product: null, confidence: 0, auto: false, candidates: [], reason: '', brand, category: cat, key: couponKey(coupon) };

    // 1. Already picked for this exact offer before.
    const pick = getPicks()[res.key];
    if (pick) {
      if (pick.search) return Object.assign(res, { reason: 'remembered: search Walmart', confidence: 1, remembered: true });
      const u = usuals.find((x) => x.id === pick.id) || pick;
      return Object.assign(res, { product: pub(u.name ? u : Object.assign({ name: pick.short }, pick)), confidence: 1, auto: true, reason: 'remembered choice', remembered: true,
        candidates: rankAll() });
    }

    function scoreOne(u) {
      const why = [];
      let s;
      if (!generic) {
        if (u._brand !== brand) return null;           // a different brand would not earn the Ibotta cash back
        s = 0.5; why.push('brand');
        if (cat && u._cat === cat) { s += 0.25; why.push('type'); }
        else if (cat && u._cat && u._cat !== cat) s -= 0.25;
        else if (!cat) s += 0.1;
      } else {
        if (!cat || u._cat !== cat) return null;        // "Any Brand" offers need the same kind of product
        s = 0.6; why.push('type');
      }
      const ov = ctok.length ? ctok.filter((t) => u._tok.has(t)).length / ctok.length : 0;
      s += (generic ? 0.2 : 0.15) * ov;
      const uv = variantOf(u._cat, u.name);
      if (variant && uv) { if (uv === variant) { s += 0.1; why.push(variant); } else { s -= 0.35; why.push('not ' + variant); } }
      const fit = want ? sizeFit(want, u._size) : 0;
      if (fit > 0) { s += 0.1; why.push('size'); } else if (fit < 0) { s -= 0.3; why.push('wrong size'); }
      // Fine-print exclusions ("Offer excludes the following: Toaster Strudel...").
      if (lists.exclude.some((ex) => { const et = tokens(ex).filter((t) => !brandTok.has(t)); return et.length && et.filter((t) => u._tok.has(t)).length / et.length >= 0.7; })) {
        s -= 0.6; why.push('excluded');
      }
      s += 0.04 * Math.min(1, (u.trips || 0) / 4);
      return { u, score: Math.max(0, Math.min(0.99, s)), why };
    }
    function rankAll() {
      return usuals.map(scoreOne).filter((x) => x && x.score >= 0.35)
        .sort((a, b) => b.score - a.score || (b.u.trips || 0) - (a.u.trips || 0) || String(b.u.lastBought).localeCompare(String(a.u.lastBought)))
        .map((x) => ({ product: pub(x.u), score: +x.score.toFixed(2), why: x.why }));
    }

    let ranked = rankAll();
    // Never offer the wrong variant (2% when the offer is Whole) if a right one exists.
    if (ranked.some((c) => !c.why.some((w) => w.startsWith('not ')))) ranked = ranked.filter((c) => !c.why.some((w) => w.startsWith('not ') || w === 'excluded'));
    // Oak Farms Whole Milk, any size: the gallon is the default. Pint stays in the list so Change can switch to it.
    const gallonOf = (c) => { const s = `${c.product.size || ''} ${c.product.short || ''}`; return /\bgallon\b/i.test(s) && !/half gallon/i.test(s); };
    const defaultGallon = anySize && brand === 'oak farms' && variant === 'whole' && ranked.some(gallonOf);
    if (defaultGallon) {
      const gi = ranked.findIndex(gallonOf);
      if (gi > 0) ranked.unshift(ranked.splice(gi, 1)[0]);
    }
    res.candidates = ranked.slice(0, 3);
    if (!ranked.length) {
      res.reason = generic ? `no ${cat || 'similar'} products in your Walmart history` : `you haven't bought ${brand} at Walmart yet`;
      return res;
    }
    const [a, b] = ranked;
    let conf = a.score;
    // Two close options: ask once, unless one is a clear habit. Whole-milk gallon is the exception above.
    if (defaultGallon) res.reason = 'default gallon';
    else if (b && b.score >= a.score - 0.08) {
      const ta = a.product.trips || 0, tb = b.product.trips || 0;
      const habit = ta >= 3 && ta >= 2 * tb;
      if (!habit) { conf = Math.min(conf, 0.55); res.reason = 'a few close options'; }
      else res.reason = `usual pick (${ta} of your trips)`;
    } else res.reason = a.why.join(' + ');
    res.confidence = +conf.toFixed(2);
    res.product = a.product;
    res.auto = conf >= AUTO;
    return res;
  }

  /** Same as match(), plus the optional AI assist for unsure results (never required; offline-safe). */
  async function matchSmart(coupon) {
    const r = match(coupon);
    const ai = api.aiAssist;
    if (r.auto || r.remembered || typeof ai !== 'function' || (root.navigator && root.navigator.onLine === false)) return r;
    try {
      const guess = await Promise.race([
        ai({ coupon, local: r, usuals: usuals.map(pub) }),
        new Promise((res) => setTimeout(() => res(null), 4000)),
      ]);
      if (guess && guess.id) {
        const u = usuals.find((x) => x.id === String(guess.id));
        const p = u ? pub(u) : guess.url && guess.short ? { id: String(guess.id), short: guess.short, name: guess.short, url: guess.url } : null;
        const c = Math.max(0, Math.min(0.95, +guess.confidence || 0));
        if (p) return Object.assign(r, { product: p, confidence: c, auto: c >= AUTO, reason: 'AI: ' + (guess.reason || 'suggested'), ai: true });
      }
    } catch {}
    return r;
  }

  const api = {
    AUTO, load, setUsuals, match, matchSmart, remember, forget, getPicks, couponKey,
    get usuals() { return usuals.map(pub); },
    // Pluggable AI hook: async ({ coupon, local, usuals }) => ({ id, confidence, reason } | null).
    // Left null so the app is fully offline/local by default.
    aiAssist: null,
    _: { norm, tokens, brandOf, categoryOf, variantOf, sizesOf, sizeFit, shortName, offerLists },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DealMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
