/*
 * Digital TopLoader card scanner (v0.30)
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
  // UI
  // ---------------------------------------------------------------------------

  var CSS = '' +
    '.dts-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2000;display:none;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}' +
    '.dts-overlay.open{display:flex}' +
    '.dts-modal{background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:14px;width:100%;max-width:1000px;max-height:94vh;overflow:auto;box-sizing:border-box;padding:16px}' +
    '.dts-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px}' +
    '.dts-head h3{margin:0;font-size:17px}' +
    '.dts-x{background:transparent;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;padding:2px 6px}' +
    '.dts-x:hover{color:var(--text)}' +
    '.dts-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}' +
    '@media(max-width:760px){.dts-grid{grid-template-columns:minmax(0,1fr)}}' +
    '.dts-col{min-width:0}' +
    '.dts-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}' +
    '.dts-row label{font-size:12px;color:var(--text-muted)}' +
    '.dts-modal select,.dts-modal input[type=text],.dts-modal input[type=number]{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:12px;min-width:0;box-sizing:border-box}' +
    '.dts-cam{position:relative;background:#000;border-radius:10px;overflow:hidden;width:100%;min-height:200px}' +
    '.dts-cam video{width:100%;display:block}' +
    '.dts-cam-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#cfd4dd;font-size:13px;padding:16px}' +
    '.dts-guide{position:absolute;border:2px dashed rgba(255,255,255,.9);border-radius:8px;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none;display:none}' +
    '.dts-btn{background:var(--accent);color:#fff;border:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}' +
    '.dts-btn:disabled{opacity:.5;cursor:default}' +
    '.dts-btn.secondary{background:var(--bg);color:var(--text);border:1px solid var(--border)}' +
    '.dts-btn.small{padding:5px 10px;font-size:11px}' +
    '.dts-status{font-size:12px;color:var(--text-muted);min-height:18px;margin:8px 0}' +
    '.dts-status.err{color:#e5484d}' +
    '.dts-cand{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--border);font-size:12px}' +
    '.dts-cand img,.dts-trow img{width:40px;height:56px;object-fit:cover;border-radius:4px;background:var(--bg);flex:none}' +
    '.dts-cand .info,.dts-trow .info{flex:1;min-width:0}' +
    '.dts-cand .nm,.dts-trow .nm{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.dts-cand .mt,.dts-trow .mt{color:var(--text-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.dts-tray{border:1px solid var(--border);border-radius:10px;padding:8px 10px;min-height:60px;background:var(--bg)}' +
    '.dts-trow{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--border);font-size:12px}' +
    '.dts-trow:first-child{border-top:none}' +
    '.dts-ctl{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center}' +
    '.dts-step{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:6px;overflow:hidden}' +
    '.dts-step button{background:var(--card);color:var(--text);border:none;width:24px;height:26px;cursor:pointer;font-size:14px}' +
    '.dts-step span{min-width:24px;text-align:center;font-size:12px}' +
    '.dts-note{font-size:11px;color:var(--text-muted);margin-top:10px}' +
    '.dts-empty{font-size:12px;color:var(--text-muted);padding:10px 0}';

  var S = { built: false, opts: null, games: [], gameId: '', tray: [], stream: null, facing: 'environment', busy: false, purchase: false, autoAdd: true };
  var el = {};

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage may be unavailable */ } }

  function build() {
    if (S.built) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var ov = document.createElement('div');
    ov.className = 'dts-overlay';
    ov.innerHTML = '' +
      '<div class="dts-modal" role="dialog" aria-label="Scan cards">' +
        '<div class="dts-head"><h3><i class="ti ti-scan" aria-hidden="true"></i> Scan cards</h3><button class="dts-x" data-act="close" aria-label="Close">&times;</button></div>' +
        '<div class="dts-grid">' +
          '<div class="dts-col">' +
            '<div class="dts-row"><label for="dts-game">Game</label><select id="dts-game"></select>' +
              '<label style="margin-left:auto;display:flex;gap:5px;align-items:center;"><input type="checkbox" id="dts-auto" checked> Auto-add confident matches</label></div>' +
            '<div class="dts-cam" id="dts-cam"><video id="dts-video" playsinline muted></video><div class="dts-guide" id="dts-guide"></div><div class="dts-cam-msg" id="dts-cammsg">Starting camera...</div></div>' +
            '<div class="dts-row" style="margin-top:10px;">' +
              '<button class="dts-btn" id="dts-scan">Scan card</button>' +
              '<button class="dts-btn secondary" id="dts-flip" style="display:none;">Switch camera</button>' +
              '<label class="dts-btn secondary" style="margin:0;cursor:pointer;">Use a photo<input type="file" id="dts-file" accept="image/*" style="display:none;"></label>' +
            '</div>' +
            '<div class="dts-status" id="dts-status">Fit the card inside the frame, keep it flat, then tap Scan.</div>' +
            '<div id="dts-cands"></div>' +
            '<div class="dts-row"><input type="text" id="dts-q" placeholder="Or search by name" style="flex:1;"><button class="dts-btn secondary small" id="dts-qgo">Search</button></div>' +
            '<div class="dts-note">Photos stay on your device and are never uploaded or saved. Only cards you confirm are added.</div>' +
          '</div>' +
          '<div class="dts-col">' +
            '<div class="dts-row" style="justify-content:space-between;"><strong style="font-size:13px;">Scanned cards <span id="dts-count" style="color:var(--text-muted);font-weight:400;"></span></strong><button class="dts-btn secondary small" id="dts-clear">Clear</button></div>' +
            '<div class="dts-tray" id="dts-tray"></div>' +
            '<div class="dts-row" style="margin-top:10px;"><label style="display:flex;gap:5px;align-items:center;"><input type="checkbox" id="dts-purchase"> Track as a purchase (cost basis)</label></div>' +
            '<div class="dts-row" id="dts-purchase-row" style="display:none;"><input type="text" id="dts-source" placeholder="Source (store, show, seller)" style="flex:1;"><strong id="dts-total" style="font-size:12px;"></strong></div>' +
            '<button class="dts-btn" id="dts-save" style="width:100%;">Add all to collection</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    el.ov = ov; el.modal = ov.querySelector('.dts-modal');
    ['game', 'auto', 'cam', 'video', 'guide', 'cammsg', 'scan', 'flip', 'file', 'status', 'cands', 'q', 'qgo', 'count', 'clear', 'tray', 'purchase', 'purchase-row', 'source', 'total', 'save']
      .forEach(function (id) { el[id] = ov.querySelector('#dts-' + id); });

    ov.addEventListener('mousedown', function (e) { if (e.target === ov) requestClose(); });
    ov.querySelector('[data-act=close]').addEventListener('click', requestClose);
    el.scan.addEventListener('click', function () { doScan(null); });
    el.flip.addEventListener('click', function () { S.facing = S.facing === 'environment' ? 'user' : 'environment'; startCamera(); });
    el.file.addEventListener('change', onFile);
    el.game.addEventListener('change', function () { S.gameId = el.game.value; lsSet('dtl-scan-game', S.gameId); });
    el.auto.addEventListener('change', function () { S.autoAdd = el.auto.checked; });
    el.qgo.addEventListener('click', manualSearch);
    el.q.addEventListener('keydown', function (e) { if (e.key === 'Enter') manualSearch(); });
    el.clear.addEventListener('click', function () { if (!S.tray.length || confirm('Remove all scanned cards from this list?')) { S.tray = []; renderTray(); } });
    el.purchase.addEventListener('change', function () { S.purchase = el.purchase.checked; renderTray(); });
    el.save.addEventListener('click', saveAll);
    el.tray.addEventListener('click', onTrayClick);
    el.tray.addEventListener('change', onTrayChange);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.ov.classList.contains('open')) requestClose(); });
    el.video.addEventListener('loadedmetadata', layoutGuide);
    S.built = true;
  }

  function setStatus(msg, busy, isErr) {
    el.status.textContent = msg;
    el.status.classList.toggle('err', !!isErr);
  }

  function guideRect(vw, vh) {
    var h = Math.min(vh * 0.9, (vw * 0.92) / CARD_ASPECT), w = h * CARD_ASPECT;
    return { x: (vw - w) / 2, y: (vh - h) / 2, w: w, h: h };
  }

  function layoutGuide() {
    var v = el.video;
    if (!v.videoWidth) return;
    var g = guideRect(v.videoWidth, v.videoHeight);
    el.guide.style.left = (g.x / v.videoWidth * 100) + '%';
    el.guide.style.top = (g.y / v.videoHeight * 100) + '%';
    el.guide.style.width = (g.w / v.videoWidth * 100) + '%';
    el.guide.style.height = (g.h / v.videoHeight * 100) + '%';
    el.guide.style.display = 'block';
    el.cammsg.style.display = 'none';
  }

  function stopCamera() {
    if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
    if (el.video) el.video.srcObject = null;
    if (el.guide) el.guide.style.display = 'none';
  }

  async function startCamera() {
    stopCamera();
    el.cammsg.style.display = 'flex';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      el.cammsg.textContent = 'Camera is not available in this browser. Use "Use a photo" instead.';
      return;
    }
    el.cammsg.textContent = 'Starting camera...';
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: S.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      el.video.srcObject = S.stream;
      await el.video.play();
      layoutGuide();
      try { var devs = await navigator.mediaDevices.enumerateDevices(); el.flip.style.display = devs.filter(function (d) { return d.kind === 'videoinput'; }).length > 1 ? '' : 'none'; } catch (e) { /* optional */ }
    } catch (e) {
      el.cammsg.textContent = (e && e.name === 'NotAllowedError')
        ? 'Camera access was blocked. Allow it in your browser settings, or use "Use a photo".'
        : 'Could not start the camera. You can still use "Use a photo".';
    }
  }

  function captureFrame() {
    var v = el.video;
    if (!v.videoWidth) return null;
    var g = guideRect(v.videoWidth, v.videoHeight);
    var scale = Math.min(1, 1400 / g.h);
    var c = document.createElement('canvas');
    c.width = Math.round(g.w * scale); c.height = Math.round(g.h * scale);
    c.getContext('2d').drawImage(v, g.x, g.y, g.w, g.h, 0, 0, c.width, c.height);
    return c;
  }

  async function onFile() {
    var f = el.file.files && el.file.files[0];
    el.file.value = '';
    if (!f) return;
    try {
      var bmp = await createImageBitmap(f);
      var scale = Math.min(1, 1400 / bmp.height);
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      doScan(c);
    } catch (e) { setStatus('Could not read that image.', false, true); }
  }

  async function doScan(provided) {
    if (S.busy) return;
    if (!S.gameId) { setStatus('Choose a game first.', false, true); return; }
    var frame = provided || captureFrame();
    if (!frame) { setStatus('The camera is not ready yet.', false, true); return; }
    S.busy = true; el.scan.disabled = true; el.cands.innerHTML = '';
    try {
      var res = await runPipeline(S.opts.client, S.gameId, frame, function (m) { setStatus(m); });
      handleResult(res);
    } catch (e) {
      console.error('Scan failed:', e);
      setStatus((e && e.message) || 'Scan failed. Try again.', false, true);
    } finally {
      S.busy = false; el.scan.disabled = false; frame = null;
    }
  }

  function cardLabel(c) { return esc(c.name) + (c.card_number ? ' #' + esc(c.card_number) : ''); }

  function handleResult(res) {
    if (!res.hadText || !res.ranked.length) {
      setStatus('Could not match that card. Hold it flatter, reduce glare, and try again, or search by name below.', false, true);
      return;
    }
    if (S.autoAdd && isConfident(res.ranked)) {
      var top = res.ranked[0];
      addToTray(top.card);
      setStatus('Added ' + top.card.name + (top.card.card_number ? ' #' + top.card.card_number : '') + ' (' + Math.round(top.score * 100) + '% match). Ready for the next card.');
      return;
    }
    setStatus('Pick the matching card, or scan again.');
    showCandidates(res.ranked.map(function (r) { return { card: r.card, score: r.score }; }));
  }

  function showCandidates(list) {
    if (!list.length) { el.cands.innerHTML = '<div class="dts-empty">No cards found.</div>'; return; }
    el.cands.innerHTML = list.map(function (r, i) {
      var c = r.card;
      return '<div class="dts-cand">' +
        (c.image_url ? '<img src="' + esc(c.image_url) + '" alt="" loading="lazy">' : '<div style="width:40px;height:56px;background:var(--bg);border-radius:4px;flex:none;"></div>') +
        '<div class="info"><div class="nm">' + cardLabel(c) + '</div>' +
        '<div class="mt">' + esc((c.sets && c.sets.name) || '') + (c.rarity ? ' &middot; ' + esc(c.rarity) : '') + (r.score != null ? ' &middot; ' + Math.round(r.score * 100) + '%' : '') + '</div></div>' +
        '<button class="dts-btn small" data-pick="' + i + '">Add</button></div>';
    }).join('');
    el.cands.onclick = function (e) {
      var b = e.target.closest('[data-pick]');
      if (!b) return;
      addToTray(list[parseInt(b.getAttribute('data-pick'), 10)].card);
      el.cands.innerHTML = '';
      setStatus('Added. Ready for the next card.');
    };
  }

  async function manualSearch() {
    var q = el.q.value.trim();
    if (!q) return;
    if (!S.gameId) { setStatus('Choose a game first.', false, true); return; }
    var r = await S.opts.client.from('cards').select(CARD_SELECT).eq('sets.game_id', S.gameId).ilike('name', '%' + q + '%').limit(12);
    if (r.error) { setStatus('Search failed, see console.', false, true); console.error(r.error); return; }
    setStatus((r.data && r.data.length) ? 'Pick a card to add.' : 'No cards found for that search.');
    showCandidates((r.data || []).map(function (c) { return { card: c, score: null }; }));
  }

  // ---- tray ----

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
      if (t.card.id === card.id && t.variant === variant && t.language === 'English' && t.itemType === 'Raw') { t.qty += 1; renderTray(); return; }
    }
    S.tray.push({ card: card, qty: 1, variant: variant, language: 'English', itemType: 'Raw', grade: null, price: 0 });
    renderTray();
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* optional */ } }
  }

  function renderTray() {
    el.count.textContent = S.tray.length ? '(' + S.tray.reduce(function (n, t) { return n + t.qty; }, 0) + ')' : '';
    el['purchase-row'].style.display = S.purchase ? 'flex' : 'none';
    if (!S.tray.length) {
      el.tray.innerHTML = '<div class="dts-empty">Scanned cards collect here. Nothing is saved until you tap Add all.</div>';
    } else {
      el.tray.innerHTML = S.tray.map(function (t, i) {
        var c = t.card, variants = (c.latest_prices || []).map(function (v) { return v.variant; });
        if (variants.indexOf(t.variant) === -1) variants.unshift(t.variant);
        if (variants.length === 0) variants = ['Normal'];
        var vOpts = uniq(variants).map(function (v) { return '<option value="' + esc(v) + '"' + (v === t.variant ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
        return '<div class="dts-trow" data-i="' + i + '">' +
          (c.image_url ? '<img src="' + esc(c.image_url) + '" alt="" loading="lazy">' : '<div style="width:40px;height:56px;background:var(--card);border-radius:4px;flex:none;"></div>') +
          '<div class="info"><div class="nm">' + cardLabel(c) + '</div><div class="mt">' + esc((c.sets && c.sets.name) || '') + '</div>' +
          '<div class="dts-ctl">' +
            '<span class="dts-step"><button data-act="dec" aria-label="Less">-</button><span>' + t.qty + '</span><button data-act="inc" aria-label="More">+</button></span>' +
            '<select data-f="variant">' + vOpts + '</select>' +
            '<select data-f="language"><option' + (t.language === 'English' ? ' selected' : '') + '>English</option><option' + (t.language === 'Japanese' ? ' selected' : '') + '>Japanese</option></select>' +
            '<select data-f="itemType"><option' + (t.itemType === 'Raw' ? ' selected' : '') + '>Raw</option><option' + (t.itemType === 'Sleeve' ? ' selected' : '') + '>Sleeve</option><option' + (t.itemType === 'Slab' ? ' selected' : '') + '>Slab</option></select>' +
            (t.itemType === 'Slab' ? '<input type="number" data-f="grade" min="0" max="10" step="0.5" placeholder="Grade" value="' + (t.grade == null ? '' : t.grade) + '" style="width:64px;">' : '') +
            (S.purchase ? '<input type="number" data-f="price" min="0" step="0.01" placeholder="Price" value="' + (t.price || '') + '" style="width:72px;">' : '') +
          '</div></div>' +
          '<button class="dts-x" data-act="rm" aria-label="Remove" style="align-self:flex-start;">&times;</button></div>';
      }).join('');
    }
    updateTotal();
    el.save.textContent = S.tray.length ? 'Add ' + S.tray.reduce(function (n, t) { return n + t.qty; }, 0) + ' card' + (S.tray.reduce(function (n, t) { return n + t.qty; }, 0) === 1 ? '' : 's') + ' to collection' : 'Add all to collection';
    el.save.disabled = !S.tray.length;
  }

  function updateTotal() {
    var total = S.tray.reduce(function (n, t) { return n + (t.price || 0); }, 0);
    el.total.textContent = S.purchase ? 'Total ' + total.toFixed(2) : '';
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
    var batchId = null, failed = 0, saved = 0;
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
          if (pi.error || !pi.data) { failed++; console.error(pi.error); continue; }
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
        if (err) { failed++; console.error(err); } else saved++;
      }
    } catch (e) {
      console.error('Scan save failed:', e);
      setStatus(e.message || 'Save failed, see console.', false, true);
      S.busy = false; renderTray();
      return;
    }
    S.busy = false;
    if (failed === 0) {
      S.tray = []; el.source.value = '';
      renderTray();
      setStatus('Saved ' + saved + ' card line' + (saved === 1 ? '' : 's') + ' to your collection.');
    } else {
      setStatus(saved + ' saved, ' + failed + ' failed. The failed cards are still in the list, see console.', false, true);
      renderTray();
    }
    if (S.opts.onSaved) { try { S.opts.onSaved(); } catch (e) { console.error(e); } }
  }

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
    S.tray = [];
    stopCamera();
    el.ov.classList.remove('open');
  }

  async function open(opts) {
    S.opts = opts || {};
    build();
    S.purchase = !!S.opts.purchase;
    el.purchase.checked = S.purchase;
    el.auto.checked = S.autoAdd;
    el.ov.classList.add('open');
    el.cands.innerHTML = '';
    setStatus('Fit the card inside the frame, keep it flat, then tap Scan.');
    renderTray();
    getWorker().catch(function () { /* surfaced on the first scan */ });
    startCamera();
    if (!S.games.length) await loadGames();
  }

  var api = { open: open, _test: { normName: normName, nameScore: nameScore, parseNumbers: parseNumbers, setTokens: setTokens, numberScore: numberScore, setScore: setScore, textScore: textScore, isConfident: isConfident, tokensOf: tokensOf, lev: lev, numberVariants: numberVariants, guideRect: guideRect } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DTScan = api;
})(typeof window !== 'undefined' ? window : globalThis);
