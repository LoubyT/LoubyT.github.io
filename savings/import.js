/* Add from screenshot: on-device OCR of Ibotta offer screenshots.
 * Loaded lazily by app.js only when the user picks screenshots.
 * Uses vendored Tesseract.js (no server, no API key). */
(() => {
  'use strict';
  const base = new URL('vendor/tesseract/', document.baseURI).href;
  let workerPromise = null;
  let onLog = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.Tesseract) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the reader'));
      document.head.appendChild(s);
    });
  }

  function getWorker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        await loadScript(base + 'tesseract.min.js');
        const w = await window.Tesseract.createWorker('eng', 1 /* LSTM only */, {
          workerPath: base + 'worker.min.js',
          corePath: base + 'core/',
          langPath: base + 'lang',
          logger: (m) => onLog && onLog(m),
        });
        await w.setParameters({ preserve_interword_spaces: '1' });
        return w;
      })().catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  /** Decode, crop the status bar, scale, grayscale + invert (dark theme -> dark text on light). */
  async function preprocess(file) {
    const bmp = await createImageBitmap(file);
    const W = 1000;
    const scale = W / bmp.width;
    const top = Math.round(bmp.height * 0.035);           // skip iOS status bar
    const srcH = bmp.height - top;
    const H = Math.round(srcH * scale);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, top, bmp.width, srcH, 0, 0, W, H);
    bmp.close && bmp.close();
    // Keep a colour copy for the product thumbnail.
    const color = document.createElement('canvas');
    color.width = W; color.height = H;
    color.getContext('2d').drawImage(c, 0, 0);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    // Mean luminance tells us dark vs light theme.
    let sum = 0;
    for (let i = 0; i < d.length; i += 16) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const dark = sum / (d.length / 16) < 110;
    for (let i = 0; i < d.length; i += 4) {
      let y = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (dark) y = 255 - y;
      // gentle contrast stretch
      y = Math.max(0, Math.min(255, (y - 40) * 1.35));
      d[i] = d[i + 1] = d[i + 2] = y;
    }
    ctx.putImageData(img, 0, 0);
    return { gray: c, color, dark };
  }

  /* ---------- product thumbnail ----------
   * The product photo sits between the header bar ("X  Title  share") and the "$X back" line.
   * Find that band from OCR line boxes, trim the flat background, and paint the product
   * onto a light tile so it sits nicely on the app's light cards. */
  const TILE = [242, 241, 236];      // matches --thumb-bg in styles.css
  const THUMB = 160;

  function thumbBand(lines, H) {
    const amtLine = lines.find((l) => AMT_RE.test(l.text));
    const titleLine = lines.find((l) => l.bbox.y0 < H * 0.15 && TITLE_RE.test(l.text.trim()));
    const y0 = titleLine ? titleLine.bbox.y1 + H * 0.015 : H * 0.07;
    const y1 = amtLine ? amtLine.bbox.y0 - H * 0.012 : H * 0.36;
    return y1 - y0 > H * 0.05 ? [Math.round(y0), Math.round(y1)] : null;
  }

  function makeThumb(color, band) {
    if (!band) return '';
    const W = color.width;
    const [y0, y1] = band;
    const h = y1 - y0;
    const src = color.getContext('2d', { willReadFrequently: true }).getImageData(0, y0, W, h);
    const d = src.data;
    // Background colour: median of the band's left/right edge pixels.
    const samp = [];
    for (let y = 0; y < h; y += 4) for (const x of [6, W - 7]) { const i = (y * W + x) * 4; samp.push([d[i], d[i + 1], d[i + 2]]); }
    const med = (k) => samp.map((p) => p[k]).sort((a, b) => a - b)[samp.length >> 1];
    const bg = [med(0), med(1), med(2)];
    const dist = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
    // Bounding box of "content" columns/rows (ignores thin lines like the scroll bar).
    const xm = Math.round(W * 0.04);
    const colN = new Uint32Array(W), rowN = new Uint32Array(h);
    for (let y = 0; y < h; y++) for (let x = xm; x < W - xm; x++) {
      if (dist((y * W + x) * 4) > 60) { colN[x]++; rowN[y]++; }
    }
    const colMin = Math.max(3, h * 0.02), rowMin = Math.max(3, W * 0.01);
    let bx0 = xm, bx1 = W - xm, by0 = 0, by1 = h;
    while (bx0 < bx1 && colN[bx0] < colMin) bx0++;
    while (bx1 > bx0 && colN[bx1 - 1] < colMin) bx1--;
    while (by0 < by1 && rowN[by0] < rowMin) by0++;
    while (by1 > by0 && rowN[by1 - 1] < rowMin) by1--;
    if (bx1 - bx0 < 20 || by1 - by0 < 20) return '';
    // Square crop around the product with a little breathing room.
    const side = Math.round(Math.max(bx1 - bx0, by1 - by0) * 1.12);
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    // Blend each pixel onto the light tile: the closer to the background, the more tile shows.
    const out = document.createElement('canvas');
    out.width = out.height = THUMB;
    const octx = out.getContext('2d');
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = h;
    const t = tmp.getContext('2d');
    const od = t.createImageData(W, h);
    const o = od.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = Math.max(0, Math.min(1, (dist(i) - 18) / 70));
      o[i] = d[i] * a + TILE[0] * (1 - a);
      o[i + 1] = d[i + 1] * a + TILE[1] * (1 - a);
      o[i + 2] = d[i + 2] * a + TILE[2] * (1 - a);
      o[i + 3] = 255;
    }
    t.putImageData(od, 0, 0);
    octx.fillStyle = `rgb(${TILE.join(',')})`;
    octx.fillRect(0, 0, THUMB, THUMB);
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(tmp, cx - side / 2, cy - side / 2, side, side, 0, 0, THUMB, THUMB);
    // JPEG keeps each thumbnail around 5–10 KB.
    return out.toDataURL('image/jpeg', 0.72);
  }

  const AMT_RE = /(?:^|[\s$S§])\$?\s?(\d{1,3}[.,]\d{2})\s*b\s?[a@]\s?c\s?k\b/i;
  const TITLE_RE = /^[^A-Za-z0-9]{0,2}[xX×]\s{1,}[A-Z0-9]/;

  const clean = (s) => s
    .replace(/[™®©]/g, '')
    .replace(/(\d)\s*fl\s*[0O]z\b/gi, '$1 fl oz')
    .replace(/(\d)\s*[0O]z\b/g, '$1 oz')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();

  /** Turn OCR text into { name, amount, note, store, confident }. */
  function parse(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const out = { name: '', amount: 0, note: '', store: 'walmart', heb: false, walmart: false, title: '', subtitle: '' };

    // Cash back line: "$0.25 back" (OCR sometimes reads $ as S or 5, "." as ",")
    const amtRe = AMT_RE;
    let ai = lines.findIndex((l) => amtRe.test(l));
    if (ai >= 0) out.amount = parseFloat(lines[ai].match(amtRe)[1].replace(',', '.'));

    // Header title: the line that starts with the close "X" button, near the top.
    const head = lines.slice(0, ai > 0 ? Math.min(ai, 8) : 6);
    const tl = head.find((l) => /^[^A-Za-z0-9]{0,2}[xX×]\s{1,}[A-Z0-9]/.test(l));
    if (tl) out.title = clean(tl.replace(/^[^A-Za-z0-9]{0,2}[xX×]\s+/, '').replace(/\s{2,}\S{1,3}\s*$/, ''));

    // Subtitle: lines after the amount until the tag / Details.
    if (ai >= 0) {
      const sub = [];
      for (let i = ai + 1; i < Math.min(lines.length, ai + 4); i++) {
        const l = lines[i];
        if (/^(MUST\s*BUY|LIMIT\b|Details\b|x\d|Available)/i.test(l)) break;
        sub.push(l);
      }
      out.subtitle = clean(sub.join(' '));
    }

    // Name: prefer the subtitle's product name, fall back to the header title.
    const titleTrunc = /(\.\.\.|…)\s*$/.test(out.title);
    let name = '', extras = [];
    if (out.subtitle) {
      const parts = out.subtitle.split(/,\s*/);
      name = parts.shift();
      extras = parts
        .map((p) => p.trim())
        .filter((p) => p && !/^(see offer details|offer details|see|any variety|any size|select (varieties|sizes)|any flavor|varieties|sizes)$/i.test(p));
    }
    const titleClean = clean(out.title.replace(/(\.\.\.|…)\s*$/, ''));
    if (!name || name.length < 3) name = titleClean;
    // If OCR mangled the subtitle but the header is complete and looks like the same item, use the header.
    else if (!titleTrunc && titleClean && titleClean.length >= 4 && name.toLowerCase() !== titleClean.toLowerCase()
      && name.toLowerCase().startsWith(titleClean.toLowerCase().slice(0, 4)) && /[^\w\s'&.\/-]/.test(name)) name = titleClean;
    out.name = name.replace(/[^\w)\]]+$/, '').trim();

    // Notes: "Buy 2" and size restrictions like "12 fl oz/18 pk only".
    const notes = [];
    // Rules: "MUST BUY 2" / "Must buy at least 2"; "LIMIT 5" / "Limit 5: Redeem up to 5 times".
    const buy = text.match(/MUST\s*BUY\s*(\d{1,2})/i) || text.match(/Must\s+buy\s+at\s+least\s+(\d{1,2})/i);
    out.mustBuy = buy ? Math.max(1, +buy[1]) : 1;
    const lim = text.match(/Redeem\s+up\s+to\s+(\d{1,2})\s+time/i) || text.match(/\bLIMIT\s*[:.]?\s*(\d{1,2})\b/i);
    out.limit = lim ? Math.max(1, +lim[1]) : 1;
    const size = extras.find((p) => /\d/.test(p) && /(oz|ct|pk|lb|gal|ml|l\b|count|pack|only)/i.test(p));
    if (size) notes.push(size.replace(/\s*only$/i, '').trim());
    out.note = notes.join(' · ');

    // Stores: look in the "Available in-store at" section (falls back to whole text).
    const idx = text.search(/Available\s+in.?store/i);
    const storeText = idx >= 0 ? text.slice(idx) : text;
    out.walmart = /wal\s?mart/i.test(storeText);
    out.heb = /\bH\s?[-‑–]\s?E\s?[-‑–]\s?B\b|\bHEB\b/.test(storeText);
    out.store = out.heb ? 'heb' : 'walmart';   // Walmart is the default store
    // Fine print for the product matcher: "Offer valid on ... includes/excludes the following: ...".
    const di = text.search(/Offer\s+valid/i);
    if (di >= 0) {
      const tail = text.slice(di);
      const end = tail.search(/This purchase cannot|Offer must be added|Check product barcode|Available\s+in.?store/i);
      out.details = (end > 0 ? tail.slice(0, end) : tail.slice(0, 900)).replace(/[™®©]/g, '').trim();
    } else out.details = '';
    out.confident = !!(out.name && out.amount);
    return out;
  }

  async function read(file, onProgress) {
    const { gray, color } = await preprocess(file);
    const w = await getWorker();
    onLog = (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); };
    const { data } = await w.recognize(gray, {}, { text: true, blocks: true });
    onLog = null;
    const lines = [];
    (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => lines.push(l))));
    let img = '';
    try { img = makeThumb(color, thumbBand(lines, gray.height)); } catch { img = ''; }
    return { ...parse(data.text), img, raw: data.text };
  }

  async function done() {
    if (workerPromise) { const w = await workerPromise.catch(() => null); workerPromise = null; if (w) await w.terminate(); }
  }

  window.DealImport = { read, parse, done, warm: () => getWorker() };
})();
