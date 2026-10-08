/*
 * Digital TopLoader card scanner (v0.31)
 *
 * One shared file used by index.html and collection.html, so the scanner is
 * not duplicated per page. Everything runs in the visitor's browser:
 *   1. Camera frame is cropped to the on-screen card guide.
 *   2. Tesseract.js reads the text (name, collector number, set code).
 *   3. We look up candidate cards in the catalog (Supabase) by that text.
 *   4. Candidate catalog images are fingerprinted in memory and compared with
 *      the camera frame as a tie-breaker (stateless, nothing is stored).
 *   5. Confident matches drop into a review tray; "Add all" writes the
 *      confirmed cards to the collection (optionally linked to a purchase).
 *
 * Camera frames are never uploaded or saved. Only the cards the user confirms
 * are written to the database.
 *
 * Usage: DTScan.open({ client, userId, purchase, onSaved })
 */
(function (root) {
  'use strict';

  var TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var CARD_ASPECT = 63 / 88;
  var STOP_TOKENS = { HP: 1, EX: 1, GX: 1, TCG: 1, LLC: 1, ILLUS: 1, NM: 1, USA: 1, TM: 1, WOTC: 1, MAX: 1 };

  // ---------------------------------------------------------------------------
  // Pure helpers (no DOM, unit tested)
  // ---------------------------------------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normName(s) {
    return String(s || '').toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/\s-\s*[a-z]*\d+.*$/i, ' ')
      .replace(/[^a-z0-9À-ɏ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokensOf(s) { return normName(s).split(' ').filter(Boolean); }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[b.length];
  }

  // lines: array of token arrays (one per OCR line)
  function nameScore(cardName, lines) {
    var ct = tokensOf(cardName);
    if (!ct.length) return 0;
    var totalW = 0;
    ct.forEach(function (t) { totalW += t.length >= 2 ? 1 : 0.5; });
    var best = 0;
    for (var li = 0; li < lines.length; li++) {
      var lt = lines[li];
      if (!lt.length) continue;
      var matched = 0;
      for (var i = 0; i < ct.length; i++) {
        var t = ct[i];
        var tol = t.length >= 7 ? 2 : (t.length >= 4 ? 1 : 0);
        for (var j = 0; j < lt.length; j++) {
          if (Math.abs(lt[j].length - t.length) <= tol && lev(t, lt[j]) <= tol) { matched += t.length >= 2 ? 1 : 0.5; break; }
        }
      }
      var coverage = matched / totalW;
      var extra = Math.max(0, lt.length - ct.length);
      var s = coverage * (1 - Math.min(0.25, extra * 0.03));
      if (s > best) best = s;
    }
    return best;
  }

  function fixDigits(s) {
    var m = /^([A-Z]{0,3})([0-9OIL]+)$/.exec(s);
    if (!m) return s;
    return m[1] + m[2].replace(/O/g, '0').replace(/[IL]/g, '1');
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { var k = JSON.stringify(x); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  }

  function parseNumbers(text) {
    var up = String(text || '').toUpperCase();
    var fractions = [], codes = [], m;
    var fr = /\b([A-Z]{0,3}[0-9OIL]{1,4})\s*[\/\\|]\s*([A-Z]{0,3}[0-9OIL]{1,4})\b/g;
    while ((m = fr.exec(up))) {
      var n = fixDigits(m[1]), d = fixDigits(m[2]);
      if (/\d/.test(n) && /\d/.test(d)) fractions.push({ num: n, den: d });
    }
    var c1 = /\b([A-Z]{1,5}\d{1,3}[-\u2013\u2014]\d{2,4})\b/g;
    while ((m = c1.exec(up))) codes.push(m[1].replace(/[\u2013\u2014]/g, '-'));
    var c2 = /\b([A-Z]{2,4}\d{3})\b/g;
    while ((m = c2.exec(up))) codes.push(m[1]);
    return { fractions: uniq(fractions).slice(0, 4), codes: uniq(codes).slice(0, 4) };
  }

  // Set codes are printed in capitals in the card footer, so read them from the
  // original (not upper-cased) footer text only.
  function setTokens(footerText, codes) {
    var out = [], seen = {}, m, re = /\b[A-Z][A-Z0-9]{1,5}\b/g, src = String(footerText || '');
    while ((m = re.exec(src))) {
      var t = m[0];
      if (!seen[t] && !STOP_TOKENS[t]) { seen[t] = 1; out.push(t); }
    }
    (codes || []).forEach(function (c) {
      var p = c.split('-')[0];
      if (p && !seen[p]) { seen[p] = 1; out.unshift(p); }
    });
    return out.slice(0, 14);
  }

  function stripZeros(s) { return String(s).toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, '$1'); }
  function normCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/([A-Z])0+(?=\d)/g, '$1'); }

  function numberScore(stored, parsed) {
    if (!stored) return 0;
    var s = String(stored).toUpperCase().replace(/\s+/g, '');
    var i;
    for (i = 0; i < parsed.codes.length; i++) {
      var c = parsed.codes[i].replace(/\s+/g, '');
      if (s === c || s.indexOf(c) !== -1) return 1;
    }
    var parts = s.split('/');
    var sn = stripZeros(parts[0]);
    var sd = parts[1] ? stripZeros(parts[1]) : null;
    var best = 0;
    for (i = 0; i < parsed.fractions.length; i++) {
      var f = parsed.fractions[i];
      if (stripZeros(f.num) === sn) {
        best = Math.max(best, sd ? (stripZeros(f.den) === sd ? 1 : 0.7) : 0.8);
      }
    }
    return best;
  }

  function setScore(setCode, tokens) {
    if (!setCode || !tokens.length) return 0;
    var sc = normCode(setCode);
    for (var i = 0; i < tokens.length; i++) if (normCode(tokens[i]) === sc) return 1;
    return 0;
  }

  // evidence = { lines: [tokenArrays], parsed, tokens }
  function textScore(card, evidence) {
    var n = nameScore(card.name, evidence.lines);
    var hasNums = evidence.parsed.fractions.length + evidence.parsed.codes.length > 0;
    var nb = hasNums ? numberScore(card.card_number, evidence.parsed) : 0;
    var st = setScore(card.sets && card.sets.set_code, evidence.tokens);
    var base = hasNums ? 0.5 * n + 0.5 * nb : n;
    return { text: Math.min(1, base + 0.15 * st), name: n, number: nb, set: st };
  }

  function isConfident(ranked) {
    if (!ranked.length) return false;
    var top = ranked[0].score;
    var second = ranked.length > 1 ? ranked[1].score : 0;
    return top >= 0.8 && (top - second) >= 0.12;
  }

  // ---------------------------------------------------------------------------
  // Image fingerprint (stateless comparison against catalog images)
  // ---------------------------------------------------------------------------

  var FP_W = 32, FP_H = 44;

  function fpFromSource(src) {
    var c = document.createElement('canvas');
    c.width = FP_W; c.height = FP_H;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, FP_W, FP_H);
    var d = ctx.getImageData(0, 0, FP_W, FP_H).data; // throws if the canvas is tainted
    var n = FP_W * FP_H, gray = new Float32Array(n), hist = new Float32Array(64), sum = 0, i;
    for (i = 0; i < n; i++) {
      var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      var y = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = y; sum += y;
      hist[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)]++;
    }
    var mean = sum / n, varSum = 0;
    for (i = 0; i < n; i++) { gray[i] -= mean; varSum += gray[i] * gray[i]; }
    var sd = Math.sqrt(varSum / n) || 1;
    for (i = 0; i < n; i++) gray[i] /= sd;
    for (i = 0; i < 64; i++) hist[i] /= n;
    return { gray: gray, hist: hist };
  }

  function fpSimilarity(a, b) {
    var n = a.gray.length, dot = 0, i;
    for (i = 0; i < n; i++) dot += a.gray[i] * b.gray[i];
    var ncc = Math.max(0, dot / n);
    var inter = 0;
    for (i = 0; i < 64; i++) inter += Math.min(a.hist[i], b.hist[i]);
    return Math.max(0, Math.min(1, 0.6 * ncc + 0.4 * inter));
  }

  var fpCache = {};
  var hostOk = {}, hostFail = {};

  function loadCatalogFp(url) {
    if (!url) return Promise.resolve(null);
    if (fpCache[url]) return fpCache[url];
    var host;
    try { host = new URL(url, location.href).host; } catch (e) { return Promise.resolve(null); }
    if ((hostFail[host] || 0) >= 3 && !hostOk[host]) return Promise.resolve(null);
    fpCache[url] = new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var timer = setTimeout(function () { resolve(null); }, 7000);
      img.onload = function () {
        clearTimeout(timer);
        try { var fp = fpFromSource(img); hostOk[host] = true; resolve(fp); }
        catch (e) { hostFail[host] = (hostFail[host] || 0) + 3; resolve(null); }
      };
      img.onerror = function () { clearTimeout(timer); hostFail[host] = (hostFail[host] || 0) + 1; resolve(null); };
      img.src = url;
    });
    return fpCache[url];
  }

  // ---------------------------------------------------------------------------
  // OCR
  // ---------------------------------------------------------------------------

  var workerPromise = null;

  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = TESS_URL;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load the text reader. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }

  function getWorker() {
    if (!workerPromise) {
      workerPromise = (async function () {
        await loadTesseract();
        var w = await root.Tesseract.createWorker('eng');
        try { await w.setParameters({ tessedit_pageseg_mode: (root.Tesseract.PSM && root.Tesseract.PSM.SPARSE_TEXT) || '11' }); } catch (e) { /* default mode is fine */ }
        return w;
      })().catch(function (e) { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  function prep(src, sx, sy, sw, sh, scale, invert) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * scale));
    c.height = Math.max(1, Math.round(sh * scale));
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    var img = ctx.getImageData(0, 0, c.width, c.height), d = img.data, n = d.length / 4;
    var hist = new Uint32Array(256), i, g;
    for (i = 0; i < n; i++) {
      g = ((d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000) | 0;
      hist[g]++; d[i * 4] = g;
    }
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
    var range = Math.max(30, hi - lo);
    for (i = 0; i < n; i++) {
      var v = (d[i * 4] - lo) * 255 / range;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      if (invert) v = 255 - v;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function linesOf(result) {
    var data = (result && result.data) || {};
    if (data.lines && data.lines.length) return data.lines.map(function (l) { return l.text || ''; });
    return String(data.text || '').split('\n');
  }

  async function ocrCard(card, status) {
    var worker = await getWorker();
    var w = card.width, h = card.height;

    async function pass(invert) {
      var a = await worker.recognize(prep(card, 0, 0, w, h, h < 1000 ? 1.5 : 1, invert));
      var b = await worker.recognize(prep(card, 0, h * 0.78, w, h * 0.22, Math.min(3, 1400 / w), invert));
      return { lines: linesOf(a).concat(linesOf(b)), footer: (b.data && b.data.text) || '', all: ((a.data && a.data.text) || '') + '\n' + ((b.data && b.data.text) || '') };
    }

    status('Reading text...');
    var out = await pass(false);
    var parsed = parseNumbers(out.all);
    var usable = out.lines.filter(function (l) { return (l.match(/[A-Za-z]/g) || []).length >= 3; });
    if (!usable.length && !(parsed.fractions.length || parsed.codes.length)) {
      status('Trying again with inverted contrast...');
      out = await pass(true);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Catalog lookup + ranking
  // ---------------------------------------------------------------------------

  var CARD_SELECT = 'id, name, card_number, rarity, image_url, set_id, sets!inner(id, name, set_code, game_id), latest_prices(variant, market_price)';

  function numberVariants(raw) {
    var m = /^([A-Z]*)(\d+)$/.exec(raw);
    var out = [raw];
    if (m) {
      var stripped = m[1] + String(parseInt(m[2], 10));
      out.push(stripped);
      out.push(m[1] + ('000' + parseInt(m[2], 10)).slice(-3));
    }
    return uniq(out);
  }

  async function fetchCandidates(client, gameId, parsed, tokens, nameTokens) {
    var setIds = [];
    if (tokens.length) {
      var variants = [];
      tokens.forEach(function (t) { variants.push(t); var p = t.replace(/([A-Z])(\d)$/, '$10$2'); if (p !== t) variants.push(p); });
      var orSets = uniq(variants).map(function (t) { return 'set_code.ilike.' + t; }).join(',');
      var sr = await client.from('sets').select('id, set_code').eq('game_id', gameId).or(orSets).limit(40);
      if (!sr.error && sr.data) setIds = sr.data.map(function (s) { return s.id; });
    }

    var jobs = [];
    var pieces = [];
    parsed.fractions.forEach(function (f) {
      numberVariants(f.num).forEach(function (v) {
        pieces.push('card_number.eq.' + v);
        pieces.push('card_number.ilike.' + v + '/*');
      });
    });
    parsed.codes.forEach(function (c) { pieces.push('card_number.ilike.*' + c + '*'); });

    if (pieces.length) {
      var qa = client.from('cards').select(CARD_SELECT).eq('sets.game_id', gameId).or(uniq(pieces).join(',')).limit(250);
      if (setIds.length) qa = qa.in('set_id', setIds);
      jobs.push(qa);
    }
    nameTokens.slice(0, 4).forEach(function (w) {
      var qn = client.from('cards').select(CARD_SELECT).eq('sets.game_id', gameId).ilike('name', '%' + w + '%').limit(40);
      if (setIds.length) qn = qn.in('set_id', setIds);
      jobs.push(qn);
    });
    if (setIds.length && !pieces.length && !nameTokens.length) {
      jobs.push(client.from('cards').select(CARD_SELECT).eq('sets.game_id', gameId).in('set_id', setIds).limit(60));
    }

    var results = await Promise.all(jobs);
    var byId = {};
    results.forEach(function (r) {
      if (r.error) { console.warn('Scan lookup error:', r.error); return; }
      (r.data || []).forEach(function (c) { byId[c.id] = c; });
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  async function runPipeline(client, gameId, card, status) {
    var ocr = await ocrCard(card, status);
    var parsed = parseNumbers(ocr.all);
    var tokens = setTokens(ocr.footer, parsed.codes);

    var lineTokens = ocr.lines.map(tokensOf).filter(function (t) { return t.join('').length >= 3 && /[a-z]/.test(t.join('')); });
    var wordSet = {}, words = [];
    lineTokens.forEach(function (lt) { lt.forEach(function (w) { if (w.length >= 4 && /^[a-z]+$/.test(w) && !wordSet[w]) { wordSet[w] = 1; words.push(w); } }); });
    words.sort(function (a, b) { return b.length - a.length; });

    var hadText = lineTokens.length > 0 || parsed.fractions.length > 0 || parsed.codes.length > 0;
    if (!hadText) return { ranked: [], hadText: false };

    status('Searching the catalog...');
    var cands = await fetchCandidates(client, gameId, parsed, tokens, words);
    var evidence = { lines: lineTokens, parsed: parsed, tokens: tokens };

    var ranked = cands.map(function (c) { var s = textScore(c, evidence); return { card: c, text: s.text, img: null, score: s.text, parts: s }; })
      .filter(function (r) { return r.text >= 0.3; })
      .sort(function (a, b) { return b.text - a.text; });

    // Stateless image compare on the shortlist, as a tie-breaker.
    var pool = ranked.slice(0, 12);
    if (pool.length > 1) {
      status('Comparing artwork...');
      var scanFp = null;
      try { scanFp = fpFromSource(card); } catch (e) { scanFp = null; }
      if (scanFp) {
        for (var i = 0; i < pool.length; i += 6) {
          var slice = pool.slice(i, i + 6);
          var fps = await Promise.all(slice.map(function (r) { return loadCatalogFp(r.card.image_url); }));
          slice.forEach(function (r, k) { if (fps[k]) r.img = fpSimilarity(scanFp, fps[k]); });
        }
        var withImg = pool.filter(function (r) { return r.img != null; }).length;
        if (withImg >= 2) {
          pool.forEach(function (r) { r.score = r.img != null ? 0.7 * r.text + 0.3 * r.img : 0.7 * r.text; });
        }
      }
    }
    ranked.forEach(function (r) { if (r.score === undefined) r.score = r.text; });
    ranked.sort(function (a, b) { return b.score - a.score; });
    return { ranked: ranked.slice(0, 6), hadText: true };
  }

  // ---------------------------------------------------------------------------
  // UI (v0.31: fullscreen camera, Scan / Bulk Scan, bottom sheets)
  // ---------------------------------------------------------------------------

  var CFG = {
    camTimeoutMs: 15000,   // give up waiting for the camera to start
    frameWaitMs: 5000,     // wait this long for the first video frame
    blackChecksMs: [600, 1400, 2200],
    countStepMs: 1000,     // one number of the 3-2-1 countdown
    pauseMs: 1800,         // pause between bulk captures so the next card can be swapped in
    maxMisses: 3           // bulk scan stops itself after this many misses in a row
  };

  var IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|Discord|MicroMessenger|TikTok|BytedanceWebview|Line\/|Twitter|LinkedInApp|Pinterest/i;

  var CSS = [
    '.dts-overlay{position:fixed;left:0;top:0;width:100%;height:100vh;height:100dvh;background:#000;z-index:2000;display:none;color:#fff;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}',
    '.dts-overlay.open{display:block}',
    '.dts-stage{position:absolute;left:0;top:0;right:0;bottom:0;background:#000}',
    '.dts-stage video{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;background:#000}',
    '.dts-guide{position:absolute;border:2px dashed rgba(255,255,255,.9);border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.45);pointer-events:none;display:none}',
    '.dts-guide.busy{border-style:solid;border-color:var(--accent,#2E86FF);animation:dtsPulse 1s ease-in-out infinite}',
    '@keyframes dtsPulse{50%{opacity:.5}}',
    '.dts-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 12px 10px;z-index:11}',
    '.dts-chip,.dts-top select{background:rgba(20,24,32,.8);color:#fff;border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:9px 14px;font-size:14px;min-width:0;max-width:62vw}',
    '.dts-iconbtn{width:42px;height:42px;flex:none;display:inline-flex;align-items:center;justify-content:center;background:rgba(20,24,32,.8);color:#fff;border:1px solid rgba(255,255,255,.28);border-radius:50%;font-size:20px;cursor:pointer;padding:0;margin:0}',
    '.dts-iconbtn:disabled{opacity:.4}',
    '.dts-hint{position:absolute;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top));max-width:90%;z-index:5;background:rgba(20,24,32,.82);border-radius:999px;padding:7px 14px;font-size:13px;text-align:center;display:none}',
    '.dts-hint.err{background:rgba(160,30,40,.92)}',
    '.dts-banner{position:absolute;left:12px;right:12px;top:calc(110px + env(safe-area-inset-top));z-index:5;background:rgba(150,100,0,.92);border-radius:10px;padding:8px 12px;font-size:12px;display:none}',
    '.dts-start{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;gap:14px;z-index:6;width:min(270px,72vw)}',
    '.dts-big{padding:17px 20px;font-size:19px;font-weight:700;border-radius:16px;border:none;cursor:pointer;width:100%}',
    '.dts-big.primary{background:var(--accent,#2E86FF);color:#fff}',
    '.dts-big.ghost{background:rgba(20,24,32,.82);color:#fff;border:2px solid rgba(255,255,255,.7)}',
    '.dts-count{position:absolute;left:0;right:0;top:0;bottom:0;display:none;align-items:center;justify-content:center;font-size:min(34vw,200px);font-weight:800;z-index:6;pointer-events:none;text-shadow:0 4px 30px rgba(0,0,0,.7)}',
    '.dts-count.pop{animation:dtsPop .95s ease-out}',
    '@keyframes dtsPop{0%{transform:scale(1.5);opacity:0}25%{opacity:1}100%{transform:scale(.9);opacity:.85}}',
    '.dts-flash{position:absolute;left:0;top:0;right:0;bottom:0;background:#fff;opacity:0;pointer-events:none;z-index:9}',
    '.dts-flash.go{animation:dtsFlash .3s ease-out}',
    '@keyframes dtsFlash{0%{opacity:.92}100%{opacity:0}}',
    '.dts-stop{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));z-index:7;display:none;background:#d6303c;color:#fff;border:none;border-radius:999px;padding:14px 34px;font-size:16px;font-weight:700;cursor:pointer}',
    '.dts-toast{position:absolute;left:12px;right:12px;bottom:calc(148px + env(safe-area-inset-bottom));z-index:7;background:rgba(20,24,32,.94);border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:10px 12px;font-size:13px;display:none;align-items:center;gap:10px;max-width:560px;margin:0 auto}',
    '.dts-toast span{flex:1;min-width:0}',
    '.dts-toast button{background:transparent;color:var(--accent-light,#6aa9ff);border:1px solid rgba(255,255,255,.3);border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer}',
    '.dts-bottom{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px calc(14px + env(safe-area-inset-bottom));z-index:5}',
    '.dts-bottom .grp{display:flex;gap:10px;align-items:center}',
    '.dts-reviewbtn{background:rgba(20,24,32,.85);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:11px 18px;font-size:14px;font-weight:600;cursor:pointer}',
    '.dts-reviewbtn.has{background:var(--accent,#2E86FF);border-color:var(--accent,#2E86FF)}',
    '.dts-reviewbtn:disabled{opacity:.4}',
    '.dts-problem{position:absolute;left:0;top:0;right:0;bottom:0;display:none;align-items:center;justify-content:center;padding:24px;z-index:8;background:rgba(0,0,0,.88);text-align:center}',
    '.dts-problem .box{max-width:340px}',
    '.dts-problem h3{margin:0 0 8px;font-size:18px}',
    '.dts-problem p{margin:0 0 16px;font-size:14px;line-height:1.45;color:#d6dae2}',
    '.dts-problem .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}',
    '.dts-btn{background:var(--accent,#2E86FF);color:#fff;border:none;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}',
    '.dts-btn:disabled{opacity:.5;cursor:default}',
    '.dts-btn.secondary{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.35)}',
    '.dts-sheet{position:absolute;left:50%;bottom:0;width:100%;max-width:620px;transform:translate(-50%,105%);transition:transform .25s ease;z-index:10;background:var(--card,#1a1e28);color:var(--text,#e6e9ef);border:1px solid var(--border,#2a2f3b);border-radius:18px 18px 0 0;display:flex;flex-direction:column;max-height:80vh;max-height:80dvh;padding-bottom:env(safe-area-inset-bottom);box-sizing:border-box}',
    '.dts-sheet.open{transform:translate(-50%,0)}',
    '.dts-sheet.tall{height:92vh;height:92dvh;max-height:92vh;max-height:92dvh}',
    '.dts-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 8px;flex:none}',
    '.dts-sheet-head h3{margin:0;font-size:16px}',
    '.dts-sheet-body{overflow:auto;padding:0 16px 16px;min-height:0;flex:1;-webkit-overflow-scrolling:touch}',
    '.dts-sheet select,.dts-sheet input[type=text],.dts-sheet input[type=number]{background:var(--bg,#0f1218);color:var(--text,#e6e9ef);border:1px solid var(--border,#2a2f3b);border-radius:6px;padding:7px 9px;font-size:13px;min-width:0;box-sizing:border-box}',
    '.dts-sheet .dts-btn.secondary{background:var(--bg,#0f1218);color:var(--text,#e6e9ef);border:1px solid var(--border,#2a2f3b)}',
    '.dts-btn.small{padding:6px 12px;font-size:12px}',
    '.dts-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}',
    '.dts-cand{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border,#2a2f3b);font-size:13px}',
    '.dts-cand img,.dts-trow img{width:44px;height:62px;object-fit:cover;border-radius:4px;background:var(--bg,#0f1218);flex:none}',
    '.dts-cand .info,.dts-trow .info{flex:1;min-width:0}',
    '.dts-cand .nm,.dts-trow .nm{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dts-cand .mt,.dts-trow .mt{color:var(--text-muted,#8992a3);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dts-tray{border:1px solid var(--border,#2a2f3b);border-radius:10px;padding:6px 10px;min-height:60px;background:var(--bg,#0f1218)}',
    '.dts-trow{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--border,#2a2f3b);font-size:13px}',
    '.dts-trow:first-child{border-top:none}',
    '.dts-ctl{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center}',
    '.dts-step{display:inline-flex;align-items:center;border:1px solid var(--border,#2a2f3b);border-radius:6px;overflow:hidden}',
    '.dts-step button{background:var(--card,#1a1e28);color:var(--text,#e6e9ef);border:none;width:28px;height:30px;cursor:pointer;font-size:15px}',
    '.dts-step span{min-width:26px;text-align:center;font-size:13px}',
    '.dts-x{background:transparent;border:none;color:var(--text-muted,#8992a3);font-size:22px;cursor:pointer;padding:2px 6px;line-height:1}',
    '.dts-note{font-size:12px;color:var(--text-muted,#8992a3);margin-top:10px}',
    '.dts-empty{font-size:13px;color:var(--text-muted,#8992a3);padding:10px 0}'
  ].join('\n');

  var S = {
    built: false, opts: null, games: [], gameId: '', tray: [],
    stream: null, facing: 'environment', camToken: 0, camReady: false,
    busy: false, bulk: false, bulkToken: 0, misses: 0,
    purchase: false, problem: null, pickResolve: null, lastAdd: null, savedScroll: ''
  };
  var el = {};
  var toastTimer = null;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage may be unavailable */ } }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function q(id) { return el.ov.querySelector('#dts-' + id); }

  function build() {
    if (S.built) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var ov = document.createElement('div');
    ov.className = 'dts-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Scan cards');
    ov.innerHTML = '' +
      '<div class="dts-stage"><video id="dts-video" playsinline muted autoplay></video><div class="dts-guide" id="dts-guide"></div></div>' +
      '<div class="dts-top"><select id="dts-game" aria-label="Game"></select><button class="dts-iconbtn" id="dts-close" aria-label="Close"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dts-hint" id="dts-hint"></div>' +
      '<div class="dts-banner" id="dts-banner">This looks like an in-app browser (Discord, Facebook, Instagram and similar), which often blocks the camera. If the camera does not start, open digitaltoploader.com in Safari or Chrome.</div>' +
      '<div class="dts-start" id="dts-start"><button class="dts-big primary" id="dts-scan">Scan</button><button class="dts-big ghost" id="dts-bulk">Bulk Scan</button></div>' +
      '<div class="dts-count" id="dts-count"></div>' +
      '<div class="dts-flash" id="dts-flash"></div>' +
      '<button class="dts-stop" id="dts-stop">Stop</button>' +
      '<div class="dts-toast" id="dts-toast"><span id="dts-toasttext"></span><button id="dts-undo" style="display:none;">Undo</button></div>' +
      '<div class="dts-bottom"><div class="grp">' +
        '<label class="dts-iconbtn" title="Use a photo" aria-label="Use a photo"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg><input type="file" id="dts-file" accept="image/*" style="display:none;"></label>' +
        '<button class="dts-iconbtn" id="dts-search" title="Search by name" aria-label="Search by name"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg></button>' +
        '<button class="dts-iconbtn" id="dts-flip" title="Switch camera" aria-label="Switch camera" style="display:none;"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 0-14-5.3L4 9"/><path d="M4 4v5h5"/><path d="M4 12a8 8 0 0 0 14 5.3L20 15"/><path d="M20 20v-5h-5"/></svg></button>' +
      '</div><button class="dts-reviewbtn" id="dts-reviewbtn">Review (0)</button></div>' +
      '<div class="dts-problem" id="dts-problem"><div class="box"><h3 id="dts-ptitle"></h3><p id="dts-ptext"></p><div class="row"><button class="dts-btn" id="dts-retry">Try again</button><label class="dts-btn secondary" style="margin:0;cursor:pointer;">Use a photo<input type="file" id="dts-file2" accept="image/*" style="display:none;"></label></div></div></div>' +
      '<div class="dts-sheet" id="dts-pick"><div class="dts-sheet-head"><h3 id="dts-picktitle">Pick the matching card</h3><button class="dts-btn secondary small" id="dts-skip">Skip</button></div>' +
        '<div class="dts-sheet-body"><div id="dts-cands"></div>' +
        '<div class="dts-row" style="margin-top:8px;"><input type="text" id="dts-q" placeholder="Search by name" style="flex:1;"><button class="dts-btn secondary small" id="dts-qgo">Search</button></div></div></div>' +
      '<div class="dts-sheet tall" id="dts-review"><div class="dts-sheet-head"><h3>Scanned cards <span id="dts-count2" style="font-weight:400;opacity:.7;"></span></h3>' +
        '<div style="display:flex;gap:8px;"><button class="dts-btn secondary small" id="dts-clear">Clear</button><button class="dts-btn secondary small" id="dts-rclose">Done</button></div></div>' +
        '<div class="dts-sheet-body"><div class="dts-tray" id="dts-tray"></div>' +
        '<div class="dts-row" style="margin-top:12px;"><label style="display:flex;gap:6px;align-items:center;font-size:13px;"><input type="checkbox" id="dts-purchase"> Track as a purchase (cost basis)</label></div>' +
        '<div class="dts-row" id="dts-purchase-row" style="display:none;"><input type="text" id="dts-source" placeholder="Source (store, show, seller)" style="flex:1;"><strong id="dts-total" style="font-size:13px;"></strong></div>' +
        '<button class="dts-btn" id="dts-save" style="width:100%;margin-top:4px;">Add all to collection</button>' +
        '<div class="dts-note">Photos stay on your device and are never uploaded or saved. Only cards you confirm are added.</div></div></div>';
    document.body.appendChild(ov);
    el.ov = ov;

    ['video', 'guide', 'game', 'close', 'hint', 'banner', 'start', 'scan', 'bulk', 'count', 'flash', 'stop', 'toast', 'toasttext', 'undo',
      'file', 'file2', 'search', 'flip', 'reviewbtn', 'problem', 'ptitle', 'ptext', 'retry', 'pick', 'picktitle', 'skip', 'cands', 'q', 'qgo',
      'review', 'count2', 'clear', 'rclose', 'tray', 'purchase', 'purchase-row', 'source', 'total', 'save']
      .forEach(function (id) { el[id] = q(id); });

    el.close.addEventListener('click', requestClose);
    el.scan.addEventListener('click', singleScan);
    el.bulk.addEventListener('click', startBulk);
    el.stop.addEventListener('click', stopBulk);
    el.flip.addEventListener('click', function () { S.facing = S.facing === 'environment' ? 'user' : 'environment'; startCamera(); });
    el.file.addEventListener('change', function () { onFile(el.file); });
    el.file2.addEventListener('change', function () { onFile(el.file2); });
    el.retry.addEventListener('click', startCamera);
    el.game.addEventListener('change', function () { S.gameId = el.game.value; lsSet('dtl-scan-game', S.gameId); });
    el.search.addEventListener('click', function () { openPick([], 'Search by name', true); });
    el.skip.addEventListener('click', closePick);
    el.qgo.addEventListener('click', manualSearch);
    el.q.addEventListener('keydown', function (e) { if (e.key === 'Enter') manualSearch(); });
    el.reviewbtn.addEventListener('click', function () { openReview(true); });
    el.rclose.addEventListener('click', function () { openReview(false); });
    el.clear.addEventListener('click', function () { if (!S.tray.length || confirm('Remove all scanned cards from this list?')) { S.tray = []; renderTray(); } });
    el.purchase.addEventListener('change', function () { S.purchase = el.purchase.checked; renderTray(); });
    el.save.addEventListener('click', saveAll);
    el.tray.addEventListener('click', onTrayClick);
    el.tray.addEventListener('change', onTrayChange);
    el.undo.addEventListener('click', undoLast);
    el.video.addEventListener('loadedmetadata', layoutGuide);
    window.addEventListener('resize', layoutGuide);
    window.addEventListener('orientationchange', function () { setTimeout(layoutGuide, 250); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.ov.classList.contains('open')) requestClose(); });
    S.built = true;
  }

  // ---- state -> visibility ----

  function sheetOpen() { return el.pick.classList.contains('open') || el.review.classList.contains('open'); }

  function setUI() {
    var idle = !S.busy && !S.bulk && !S.problem && !sheetOpen() && S.camReady;
    el.start.style.display = idle ? 'flex' : 'none';
    el.stop.style.display = S.bulk ? 'block' : 'none';
    el.guide.classList.toggle('busy', S.busy);
    el.guide.style.display = (S.camReady && !S.problem) ? 'block' : 'none';
    el.problem.style.display = S.problem ? 'flex' : 'none';
    el.reviewbtn.disabled = S.bulk;
    el.search.disabled = S.bulk;
    el.game.disabled = S.bulk || S.busy;
    var n = S.tray.reduce(function (a, t) { return a + t.qty; }, 0);
    el.reviewbtn.textContent = 'Review (' + n + ')';
    el.reviewbtn.classList.toggle('has', n > 0);
  }

  function setHint(msg, isErr) {
    if (!msg) { el.hint.style.display = 'none'; return; }
    el.hint.textContent = msg;
    el.hint.classList.toggle('err', !!isErr);
    el.hint.style.display = 'block';
  }

  function showToast(msg, withUndo) {
    el.toasttext.textContent = msg;
    el.undo.style.display = withUndo ? '' : 'none';
    el.toast.style.display = 'flex';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.style.display = 'none'; }, withUndo ? 5000 : 3500);
  }

  function showProblem(title, text) {
    S.problem = { title: title, text: text };
    S.camReady = false;
    el.ptitle.textContent = title;
    el.ptext.textContent = text;
    setUI();
  }

  // ---- camera ----

  function guideLayout() {
    var W = el.ov.clientWidth, H = el.ov.clientHeight;
    var gh = Math.min(H * 0.6, (W * 0.84) / CARD_ASPECT), gw = gh * CARD_ASPECT;
    return { x: (W - gw) / 2, y: (H - gh) / 2, w: gw, h: gh, W: W, H: H };
  }

  // Maps the on-screen guide to video pixels for a video drawn with object-fit: cover.
  function guideToVideo(g, vw, vh) {
    var scale = Math.max(g.W / vw, g.H / vh);
    var ox = (g.W - vw * scale) / 2, oy = (g.H - vh * scale) / 2;
    var x = (g.x - ox) / scale, y = (g.y - oy) / scale, w = g.w / scale, h = g.h / scale;
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(w, vw - x); h = Math.min(h, vh - y);
    return { x: x, y: y, w: w, h: h };
  }

  function layoutGuide() {
    if (!S.built) return;
    var g = guideLayout();
    el.guide.style.left = g.x + 'px';
    el.guide.style.top = g.y + 'px';
    el.guide.style.width = g.w + 'px';
    el.guide.style.height = g.h + 'px';
  }

  function stopCamera() {
    S.camToken++;
    S.camReady = false;
    if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
    if (el.video) { try { el.video.pause(); } catch (e) { /* ignore */ } el.video.srcObject = null; }
  }

  // Resolves with a stream, or rejects. If the request outlives the timeout and later succeeds,
  // the late stream is stopped so the camera light does not stay on.
  function requestStream(constraints, token) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        var e = new Error('Camera request timed out'); e.name = 'TimeoutError'; reject(e);
      }, CFG.camTimeoutMs);
      navigator.mediaDevices.getUserMedia(constraints).then(function (st) {
        clearTimeout(timer);
        if (done || token !== S.camToken) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
        done = true; resolve(st);
      }, function (err) {
        clearTimeout(timer);
        if (done) return;
        done = true; reject(err);
      });
    });
  }

  function videoLooksBlack() {
    try {
      var v = el.video;
      if (!v.videoWidth) return false;
      var c = document.createElement('canvas'); c.width = 16; c.height = 16;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, 16, 16);
      var d = ctx.getImageData(0, 0, 16, 16).data, sum = 0;
      for (var i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      return (sum / 256) < 4;
    } catch (e) { return false; }
  }

  async function startCamera() {
    stopCamera();
    var token = S.camToken;
    S.problem = null;
    setUI();
    var inApp = IN_APP.test(navigator.userAgent || '');
    el.banner.style.display = inApp ? 'block' : 'none';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showProblem('The camera is not available here',
        inApp ? 'This in-app browser does not allow camera access. Open digitaltoploader.com in Safari or Chrome, or use a photo instead.'
              : 'This browser cannot open the camera (it needs a secure https page). Try Safari or Chrome, or use a photo instead.');
      return;
    }

    setHint('Starting camera...');
    var attempts = [
      { video: { facingMode: { ideal: S.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: true, audio: false }
    ];
    var stream = null, lastErr = null;
    for (var i = 0; i < attempts.length && !stream; i++) {
      try {
        stream = await requestStream(attempts[i], token);
      } catch (e) {
        lastErr = e;
        if (token !== S.camToken) return;
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'TimeoutError')) break;
      }
    }
    if (token !== S.camToken) { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    setHint('');

    if (!stream) {
      var name = lastErr && lastErr.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        showProblem('Camera access is blocked', 'Allow camera access for this site in your browser settings, then tap Try again. You can also use a photo instead.');
      } else if (name === 'TimeoutError') {
        showProblem('The camera did not start', 'Nothing came back from the camera. Close other apps that may be using it, check that you answered the permission prompt, then tap Try again.' + (inApp ? ' If you opened this from Discord, Facebook or Instagram, open the site in Safari or Chrome instead.' : ''));
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        showProblem('No camera found', 'This device did not report a usable camera. You can use a photo instead.');
      } else {
        showProblem('The camera could not be opened', 'Another app may be using it. Close other camera apps and tap Try again, or use a photo instead.');
      }
      return;
    }

    S.stream = stream;
    el.video.srcObject = stream;
    // Do not await play(): on a stream that never delivers frames the promise can stay pending forever.
    try { var pp = el.video.play(); if (pp && pp.catch) pp.catch(function () { /* autoplay and muted usually cover this */ }); } catch (e) { /* ignore */ }

    // Wait for a real frame. A started camera that never delivers one shows as a black screen.
    var waited = 0;
    while (waited < CFG.frameWaitMs && !(el.video.videoWidth > 0 && el.video.readyState >= 2)) {
      await sleep(150); waited += 150;
      if (token !== S.camToken) return;
    }
    if (!(el.video.videoWidth > 0)) {
      stopCamera();
      showProblem('The camera started but shows no picture', 'Close other apps that use the camera, tap Try again, or switch cameras. If it keeps happening, reload the page or use a photo instead.');
      return;
    }

    layoutGuide();
    S.camReady = true;
    setUI();
    setHint('Fit the card inside the frame');
    setTimeout(function () { if (!S.busy && !S.bulk) setHint(''); }, 3500);

    // Black-frame check: video playing but every sample is black.
    var blackCount = 0;
    for (var k = 0; k < CFG.blackChecksMs.length; k++) {
      await sleep(k === 0 ? CFG.blackChecksMs[0] : CFG.blackChecksMs[k] - CFG.blackChecksMs[k - 1]);
      if (token !== S.camToken) return;
      if (videoLooksBlack()) blackCount++;
    }
    if (blackCount === CFG.blackChecksMs.length) {
      stopCamera();
      showProblem('The camera is sending a black picture', 'Another app may be holding the camera, or the lens may be covered. Close other camera apps, tap Try again, or use a photo instead.');
      return;
    }

    try {
      var devs = await navigator.mediaDevices.enumerateDevices();
      el.flip.style.display = devs.filter(function (d) { return d.kind === 'videoinput'; }).length > 1 ? '' : 'none';
    } catch (e) { /* optional */ }
  }

  function captureFrame() {
    var v = el.video;
    if (!v.videoWidth || v.readyState < 2) return null;
    var r = guideToVideo(guideLayout(), v.videoWidth, v.videoHeight);
    var scale = Math.min(1, 1400 / r.h);
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w * scale)); c.height = Math.max(1, Math.round(r.h * scale));
    c.getContext('2d').drawImage(v, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return c;
  }

  function shutterFx() {
    el.flash.classList.remove('go');
    void el.flash.offsetWidth;
    el.flash.classList.add('go');
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* optional */ } }
  }

  function showCount(text) {
    el.count.textContent = text;
    el.count.style.display = 'flex';
    el.count.classList.remove('pop');
    void el.count.offsetWidth;
    el.count.classList.add('pop');
  }

  function hideCount() { el.count.style.display = 'none'; el.count.classList.remove('pop'); }

  async function onFile(input) {
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    if (S.busy) return;
    try {
      var bmp = await createImageBitmap(f);
      var scale = Math.min(1, 1400 / bmp.height);
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      if (S.problem) { S.problem = null; setUI(); }
      await processFrame(c);
    } catch (e) { setHint('Could not read that image.', true); }
  }

  // ---- scanning ----

  // Returns 'added', 'pick', 'miss' or 'error'.
  async function processFrame(frame) {
    if (!S.gameId) { setHint('Choose a game first.', true); return 'error'; }
    S.busy = true; setUI(); setHint('Reading card...');
    var res;
    try {
      res = await runPipeline(S.opts.client, S.gameId, frame, function (m) { setHint(m); });
    } catch (e) {
      console.error('Scan failed:', e);
      S.busy = false; setUI();
      setHint((e && e.message) || 'Scan failed. Try again.', true);
      return 'error';
    }
    S.busy = false; setUI();

    if (!res.hadText || !res.ranked.length) {
      setHint('Could not match that card. Hold it flat, reduce glare, and try again.', true);
      return 'miss';
    }
    setHint('');
    if (isConfident(res.ranked)) {
      var top = res.ranked[0];
      addToTray(top.card);
      showToast('Added ' + top.card.name + (top.card.card_number ? ' #' + top.card.card_number : '') + ' (' + Math.round(top.score * 100) + '% match)', true);
      return 'added';
    }
    await openPick(res.ranked.map(function (r) { return { card: r.card, score: r.score }; }), 'Pick the matching card', false);
    return 'pick';
  }

  async function singleScan() {
    if (S.busy || S.bulk) return;
    var frame = captureFrame();
    if (!frame) { setHint('The camera is not ready yet.', true); return; }
    shutterFx();
    await processFrame(frame);
  }

  async function startBulk() {
    if (S.busy || S.bulk) return;
    S.bulk = true; S.misses = 0;
    var token = ++S.bulkToken;
    setUI(); setHint('Bulk scan: hold the card in the frame');
    try {
      while (S.bulk && token === S.bulkToken) {
        // 3-2-1 countdown
        for (var i = 3; i >= 1; i--) {
          if (!S.bulk || token !== S.bulkToken) break;
          showCount(String(i));
          await sleep(CFG.countStepMs);
        }
        if (!S.bulk || token !== S.bulkToken) break;
        showCount('SCAN');
        await sleep(Math.min(350, CFG.countStepMs));
        hideCount();
        if (!S.bulk || token !== S.bulkToken) break;

        var frame = captureFrame();
        if (!frame) { setHint('The camera is not ready.', true); break; }
        shutterFx();
        var outcome = await processFrame(frame);
        if (outcome === 'added' || outcome === 'pick') S.misses = 0; else S.misses++;
        if (S.misses >= CFG.maxMisses) {
          setHint('Bulk scan stopped after ' + CFG.maxMisses + ' misses in a row. Check the lighting and try again.', true);
          break;
        }
        if (!S.bulk || token !== S.bulkToken) break;
        setHint('Next card...');
        await sleep(CFG.pauseMs);
      }
    } finally {
      if (token === S.bulkToken) { S.bulk = false; }
      hideCount(); setUI();
    }
  }

  function stopBulk() {
    S.bulk = false; S.bulkToken++;
    hideCount(); setHint(''); setUI();
  }

  // ---- candidate sheet (uncertain match / manual search) ----

  function openPick(list, title, focusSearch) {
    el.picktitle.textContent = title;
    renderCandidates(list);
    el.pick.classList.add('open');
    setUI();
    if (focusSearch) setTimeout(function () { el.q.focus(); }, 280);
    return new Promise(function (resolve) { S.pickResolve = resolve; });
  }

  function closePick() {
    el.pick.classList.remove('open');
    var r = S.pickResolve; S.pickResolve = null;
    setUI();
    if (r) r();
  }

  function cardLabel(c) { return esc(c.name) + (c.card_number ? ' #' + esc(c.card_number) : ''); }

  function renderCandidates(list) {
    if (!list.length) { el.cands.innerHTML = ''; return; }
    el.cands.innerHTML = list.map(function (r, i) {
      var c = r.card;
      return '<div class="dts-cand">' +
        (c.image_url ? '<img src="' + esc(c.image_url) + '" alt="" loading="lazy">' : '<div style="width:44px;height:62px;background:var(--bg);border-radius:4px;flex:none;"></div>') +
        '<div class="info"><div class="nm">' + cardLabel(c) + '</div>' +
        '<div class="mt">' + esc((c.sets && c.sets.name) || '') + (c.rarity ? ' &middot; ' + esc(c.rarity) : '') + (r.score != null ? ' &middot; ' + Math.round(r.score * 100) + '%' : '') + '</div></div>' +
        '<button class="dts-btn small" data-pick="' + i + '">Add</button></div>';
    }).join('');
    el.cands.onclick = function (e) {
      var b = e.target.closest('[data-pick]');
      if (!b) return;
      addToTray(list[parseInt(b.getAttribute('data-pick'), 10)].card);
      closePick();
      showToast('Added', true);
    };
  }

  async function manualSearch() {
    var text = el.q.value.trim();
    if (!text) return;
    if (!S.gameId) { setHint('Choose a game first.', true); return; }
    var r = await S.opts.client.from('cards').select(CARD_SELECT).eq('sets.game_id', S.gameId).ilike('name', '%' + text + '%').limit(12);
    if (r.error) { console.error(r.error); el.cands.innerHTML = '<div class="dts-empty">Search failed, see console.</div>'; return; }
    if (!r.data || !r.data.length) { el.cands.innerHTML = '<div class="dts-empty">No cards found for that search.</div>'; return; }
    renderCandidates(r.data.map(function (c) { return { card: c, score: null }; }));
  }

  // ---- review tray ----

  function defaultVariant(card) {
    var vs = card.latest_prices || [];
    if (!vs.length) return 'Normal';
    for (var i = 0; i < vs.length; i++) if (vs[i].variant === 'Normal') return 'Normal';
    return vs[0].variant;
  }

  function addToTray(card) {
    var variant = defaultVariant(card);
    for (var i = 0; i < S.tray.length; i++) {
      var t = S.tray[i];
      if (t.card.id === card.id && t.variant === variant && t.language === 'English' && t.itemType === 'Raw') {
        t.qty += 1; S.lastAdd = t; renderTray(); return;
      }
    }
    var item = { card: card, qty: 1, variant: variant, language: 'English', itemType: 'Raw', grade: null, price: 0 };
    S.tray.push(item);
    S.lastAdd = item;
    renderTray();
  }

  function undoLast() {
    var t = S.lastAdd;
    if (!t) return;
    var i = S.tray.indexOf(t);
    if (i === -1) return;
    if (t.qty > 1) t.qty -= 1; else S.tray.splice(i, 1);
    if (!S.tray.length || S.tray.indexOf(t) === -1) S.lastAdd = null;
    el.toast.style.display = 'none';
    renderTray();
  }

  function openReview(open) {
    el.review.classList.toggle('open', !!open);
    setUI();
  }

  function updateTotal() {
    var total = S.tray.reduce(function (n, t) { return n + (t.price || 0); }, 0);
    el.total.textContent = S.purchase ? 'Total ' + total.toFixed(2) : '';
  }

  function renderTray() {
    var n = S.tray.reduce(function (a, t) { return a + t.qty; }, 0);
    el.count2.textContent = n ? '(' + n + ')' : '';
    el['purchase-row'].style.display = S.purchase ? 'flex' : 'none';
    if (!S.tray.length) {
      el.tray.innerHTML = '<div class="dts-empty">Scanned cards collect here. Nothing is saved until you tap Add all.</div>';
    } else {
      el.tray.innerHTML = S.tray.map(function (t, i) {
        var c = t.card, variants = (c.latest_prices || []).map(function (v) { return v.variant; });
        if (variants.indexOf(t.variant) === -1) variants.unshift(t.variant);
        if (!variants.length) variants = ['Normal'];
        var vOpts = uniq(variants).map(function (v) { return '<option value="' + esc(v) + '"' + (v === t.variant ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
        return '<div class="dts-trow" data-i="' + i + '">' +
          (c.image_url ? '<img src="' + esc(c.image_url) + '" alt="" loading="lazy">' : '<div style="width:44px;height:62px;background:var(--card);border-radius:4px;flex:none;"></div>') +
          '<div class="info"><div class="nm">' + cardLabel(c) + '</div><div class="mt">' + esc((c.sets && c.sets.name) || '') + '</div>' +
          '<div class="dts-ctl">' +
            '<span class="dts-step"><button data-act="dec" aria-label="Less">-</button><span>' + t.qty + '</span><button data-act="inc" aria-label="More">+</button></span>' +
            '<select data-f="variant">' + vOpts + '</select>' +
            '<select data-f="language"><option' + (t.language === 'English' ? ' selected' : '') + '>English</option><option' + (t.language === 'Japanese' ? ' selected' : '') + '>Japanese</option></select>' +
            '<select data-f="itemType"><option' + (t.itemType === 'Raw' ? ' selected' : '') + '>Raw</option><option' + (t.itemType === 'Sleeve' ? ' selected' : '') + '>Sleeve</option><option' + (t.itemType === 'Slab' ? ' selected' : '') + '>Slab</option></select>' +
            (t.itemType === 'Slab' ? '<input type="number" data-f="grade" min="0" max="10" step="0.5" placeholder="Grade" value="' + (t.grade == null ? '' : t.grade) + '" style="width:68px;">' : '') +
            (S.purchase ? '<input type="number" data-f="price" min="0" step="0.01" placeholder="Price" value="' + (t.price || '') + '" style="width:76px;">' : '') +
          '</div></div>' +
          '<button class="dts-x" data-act="rm" aria-label="Remove" style="align-self:flex-start;">&times;</button></div>';
      }).join('');
    }
    updateTotal();
    el.save.textContent = n ? 'Add ' + n + ' card' + (n === 1 ? '' : 's') + ' to collection' : 'Add all to collection';
    el.save.disabled = !S.tray.length;
    setUI();
  }

  function onTrayClick(e) {
    var b = e.target.closest('[data-act]');
    var row = e.target.closest('.dts-trow');
    if (!b || !row) return;
    var i = parseInt(row.getAttribute('data-i'), 10), t = S.tray[i], act = b.getAttribute('data-act');
    if (act === 'inc') t.qty += 1;
    else if (act === 'dec') t.qty = Math.max(1, t.qty - 1);
    else if (act === 'rm') S.tray.splice(i, 1);
    renderTray();
  }

  function onTrayChange(e) {
    var f = e.target.getAttribute('data-f');
    var row = e.target.closest('.dts-trow');
    if (!f || !row) return;
    var t = S.tray[parseInt(row.getAttribute('data-i'), 10)];
    if (f === 'grade') { t.grade = e.target.value === '' ? null : parseFloat(e.target.value); return; }
    if (f === 'price') { t.price = parseFloat(e.target.value) || 0; updateTotal(); return; }
    t[f] = e.target.value;
    if (f === 'itemType' && t.itemType !== 'Slab') t.grade = null;
    // Re-render after the event finishes so we never replace a focused control mid-blur.
    setTimeout(renderTray, 0);
  }

  async function saveAll() {
    if (!S.tray.length || S.busy) return;
    var client = S.opts.client, userId = S.opts.userId;
    S.busy = true; el.save.disabled = true; el.save.textContent = 'Saving...';
    var batchId = null, failed = 0, saved = 0, kept = [];
    try {
      if (S.purchase) {
        var total = S.tray.reduce(function (n, t) { return n + (t.price || 0); }, 0);
        var br = await client.from('card_purchase_batches').insert({ user_id: userId, source: el.source.value.trim() || null, total_price: total }).select('id').single();
        if (br.error || !br.data) throw new Error('Could not save the purchase record.');
        batchId = br.data.id;
      }
      for (var i = 0; i < S.tray.length; i++) {
        var t = S.tray[i], grade = t.itemType === 'Slab' ? t.grade : null, linkId = null;
        if (batchId) {
          var pi = await client.from('card_purchase_items').insert({ batch_id: batchId, card_id: t.card.id, quantity: t.qty, price_paid: t.price || 0, item_type: t.itemType, estimated_grade: grade }).select('id').single();
          if (pi.error || !pi.data) { failed++; kept.push(t); console.error(pi.error); continue; }
          linkId = pi.data.id;
        }
        var ex = await client.from('user_collection').select('id, quantity').eq('user_id', userId).eq('card_id', t.card.id).eq('condition', 'Near Mint').eq('variant', t.variant).eq('language', t.language).eq('item_type', t.itemType).maybeSingle();
        var err;
        if (ex.data) {
          var upd = { quantity: ex.data.quantity + t.qty };
          if (linkId) upd.card_purchase_item_id = linkId;
          if (grade != null) upd.estimated_grade = grade;
          err = (await client.from('user_collection').update(upd).eq('id', ex.data.id)).error;
        } else {
          var ins = { user_id: userId, card_id: t.card.id, quantity: t.qty, variant: t.variant, language: t.language, item_type: t.itemType, estimated_grade: grade };
          if (linkId) ins.card_purchase_item_id = linkId;
          err = (await client.from('user_collection').insert(ins)).error;
        }
        if (err) { failed++; kept.push(t); console.error(err); } else saved++;
      }
    } catch (e) {
      console.error('Scan save failed:', e);
      S.busy = false; renderTray();
      showToast(e.message || 'Save failed, see console.', false);
      return;
    }
    S.busy = false;
    S.tray = kept; S.lastAdd = null;
    if (!failed) { el.source.value = ''; openReview(false); }
    renderTray();
    showToast(failed ? saved + ' saved, ' + failed + ' failed (still in your list).' : 'Saved ' + saved + ' card line' + (saved === 1 ? '' : 's') + ' to your collection.', false);
    if (S.opts.onSaved) { try { S.opts.onSaved(); } catch (e) { console.error(e); } }
  }

  // ---- open / close ----

  async function loadGames() {
    var r = await S.opts.client.from('games').select('id, name').order('name');
    S.games = r.data || [];
    el.game.innerHTML = S.games.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>'; }).join('');
    var saved = lsGet('dtl-scan-game');
    S.gameId = S.games.some(function (g) { return String(g.id) === saved; }) ? saved : (S.games[0] ? String(S.games[0].id) : '');
    el.game.value = S.gameId;
  }

  function requestClose() {
    if (S.tray.length && !confirm('Discard ' + S.tray.length + ' scanned card' + (S.tray.length === 1 ? '' : 's') + ' that have not been added yet?')) return;
    S.tray = []; S.lastAdd = null;
    S.bulk = false; S.bulkToken++;
    closePick();
    el.review.classList.remove('open');
    stopCamera();
    hideCount(); setHint('');
    el.toast.style.display = 'none';
    el.ov.classList.remove('open');
    document.documentElement.style.overflow = S.savedScroll;
  }

  async function open(opts) {
    S.opts = opts || {};
    build();
    S.purchase = !!S.opts.purchase;
    el.purchase.checked = S.purchase;
    S.problem = null; S.busy = false; S.bulk = false;
    S.savedScroll = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    el.ov.classList.add('open');
    renderTray();
    layoutGuide();
    getWorker().catch(function () { /* surfaced on the first scan */ });
    startCamera();
    if (!S.games.length) await loadGames();
  }

  var api = {
    open: open,
    _cfg: CFG,
    _test: { normName: normName, nameScore: nameScore, parseNumbers: parseNumbers, setTokens: setTokens, numberScore: numberScore, setScore: setScore, textScore: textScore, isConfident: isConfident, tokensOf: tokensOf, lev: lev, numberVariants: numberVariants, guideToVideo: guideToVideo }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DTScan = api;
})(typeof window !== 'undefined' ? window : globalThis);
