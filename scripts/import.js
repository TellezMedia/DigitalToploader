// TCG catalog import: TCGCSV -> Supabase
// Run with: node import.js            (full import)
//       or: node import.js --test     (first set of each game only, for a sanity check)

import { createClient } from '@supabase/supabase-js';

// ---- CONFIG ----
// Reads from environment variables so this can run safely in GitHub Actions
// (via repo secrets) without a real key ever being committed to the repo.
// For local runs, either set these as env vars before running, or temporarily
// hardcode them here on your own machine (never commit real values).
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_PROJECT_URL';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'YOUR_SECRET_KEY';

if (SUPABASE_URL === 'YOUR_PROJECT_URL' || SUPABASE_SECRET_KEY === 'YOUR_SECRET_KEY') {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SECRET_KEY as environment variables, or fill them in directly for a local-only run.');
  process.exit(1);
}

const GAMES = [
  { slug: 'pokemon', name: 'Pokemon', source: 'tcgcsv', tcgcsvCategoryId: 3, hiresSource: 'pokemontcg' },
  { slug: 'mtg', name: 'Magic: The Gathering', source: 'tcgcsv', tcgcsvCategoryId: 1, hiresSource: 'scryfall' },
  { slug: 'lorcana', name: 'Disney Lorcana', source: 'tcgcsv', tcgcsvCategoryId: 71, hiresSource: 'lorcast' },
  { slug: 'onepiece', name: 'One Piece Card Game', source: 'tcgcsv', tcgcsvCategoryId: 68, hiresSource: null },
  { slug: 'digimon', name: 'Digimon Card Game', source: 'tcgcsv', tcgcsvCategoryId: 63, hiresSource: null },
  { slug: 'swu', name: 'Star Wars: Unlimited', source: 'tcgcsv', tcgcsvCategoryId: 79, hiresSource: null },
  { slug: 'fab', name: 'Flesh and Blood', source: 'tcgcsv', tcgcsvCategoryId: 62, hiresSource: null },
  { slug: 'palworld', name: 'Palworld TCG', source: 'palworldtcg' },
];

// Palworld TCG catalog comes from the fan-run palworldtcg.gg public API
// (no key, no auth, CORS-enabled) rather than TCGCSV, which doesn't carry
// this game yet. No pricing data is available from this source, so
// price_history is intentionally left untouched for this game for now.
const PALWORLDTCG_BASE = 'https://palworldtcg.gg/api/v1';

// Optional: raises pokemontcg.io rate limits from 1,000/day to 20,000/day.
// Get a free key at https://pokemontcg.io, set as a repo secret / env var.
const POKEMONTCG_API_KEY = process.env.POKEMONTCG_API_KEY || '';

const TEST_MODE = process.argv.includes('--test');
const DELAY_MS = 300; // pause between requests, be polite to a free hobby-run service

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- HI-RES IMAGE LOOKUP ----
// TCGCSV's own product images are low-res thumbnails. For games with a
// better public source, we fetch that game's set list once per run, fuzzy-
// match it against the TCGCSV group name (handles naming drift, and
// specifically promo sets, which are named inconsistently across sources
// e.g. "Scarlet & Violet Black Star Promos" vs "Promos"), then pull that
// set's cards and index them by collector number for a fast lookup while
// building each card row.

const hiresSetListCache = {}; // source -> [{ name, id }]

function normalizeCardNumber(n) {
  if (n == null) return '';
  return String(n).replace(/^0+(?=\d)/, '').trim().toLowerCase();
}

function normalizeSetName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/black star promos?/g, 'promos')
    .replace(/promotional cards?/g, 'promos')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchSet(tcgcsvGroupName, hiresSetList) {
  const target = normalizeSetName(tcgcsvGroupName);
  if (!target) return null;
  let found = hiresSetList.find((s) => normalizeSetName(s.name) === target);
  if (found) return found;
  // Fallback: containment match, catches promo-set naming drift between sources.
  found = hiresSetList.find((s) => {
    const n = normalizeSetName(s.name);
    return n && (n.includes(target) || target.includes(n));
  });
  return found || null;
}

async function getHiresSetList(source) {
  if (hiresSetListCache[source]) return hiresSetListCache[source];
  let list = [];
  try {
    if (source === 'pokemontcg') {
      const headers = POKEMONTCG_API_KEY ? { 'X-Api-Key': POKEMONTCG_API_KEY } : {};
      const res = await fetch('https://api.pokemontcg.io/v2/sets?pageSize=250', { headers });
      const json = await res.json();
      list = (json.data || []).map((s) => ({ name: s.name, id: s.id }));
    } else if (source === 'scryfall') {
      const res = await fetch('https://api.scryfall.com/sets');
      const json = await res.json();
      list = (json.data || []).map((s) => ({ name: s.name, id: s.code }));
    } else if (source === 'lorcast') {
      const res = await fetch('https://api.lorcast.com/v0/sets');
      const json = await res.json();
      list = (json.results || []).map((s) => ({ name: s.name, id: s.id }));
    }
  } catch (err) {
    console.log(`    Hi-res set list fetch failed for ${source}: ${err.message}`);
  }
  hiresSetListCache[source] = list;
  return list;
}

async function getHiresImageMap(source, tcgcsvGroupName) {
  const map = new Map();
  const setList = await getHiresSetList(source);
  const matched = matchSet(tcgcsvGroupName, setList);
  if (!matched) return map;

  try {
    if (source === 'pokemontcg') {
      const headers = POKEMONTCG_API_KEY ? { 'X-Api-Key': POKEMONTCG_API_KEY } : {};
      const res = await fetch(
        `https://api.pokemontcg.io/v2/cards?q=set.id:${matched.id}&pageSize=250`,
        { headers }
      );
      const json = await res.json();
      for (const c of json.data || []) {
        if (c.images?.large) map.set(normalizeCardNumber(c.number), c.images.large);
      }
    } else if (source === 'scryfall') {
      let url = `https://api.scryfall.com/cards/search?q=set:${matched.id}&unique=prints`;
      while (url) {
        const res = await fetch(url);
        if (!res.ok) break;
        const json = await res.json();
        for (const c of json.data || []) {
          const img = c.image_uris?.large || c.card_faces?.[0]?.image_uris?.large;
          if (img) map.set(normalizeCardNumber(c.collector_number), img);
        }
        url = json.has_more ? json.next_page : null;
        if (url) await sleep(100); // Scryfall asks for ~10 req/sec max
      }
    } else if (source === 'lorcast') {
      const res = await fetch(`https://api.lorcast.com/v0/sets/${matched.id}/cards`);
      const json = await res.json();
      const cards = Array.isArray(json) ? json : json.results || [];
      for (const c of cards) {
        const img = c.image_uris?.digital?.large;
        if (img) map.set(normalizeCardNumber(c.collector_number), img);
      }
    }
  } catch (err) {
    console.log(`    Hi-res card fetch failed for ${source}/${matched.name}: ${err.message}`);
  }
  return map;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'TCGCollectionImport/1.0 (personal project)',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  const json = await res.json();
  if (!json.success) throw new Error(`TCGCSV reported failure: ${url}`);
  return json.results;
}

// Heuristic: a product is a single card if its extendedData includes a card number field.
// Sealed products (booster boxes, packs, etc.) generally don't have this.
function isSingleCard(product) {
  if (!product.extendedData) return false;
  return product.extendedData.some(
    (e) => e.name === 'Number' || e.name === 'CardNumber'
  );
}

function getExtendedValue(product, fieldName) {
  if (!product.extendedData) return null;
  const field = product.extendedData.find((e) => e.name === fieldName);
  return field ? field.value : null;
}

async function upsertGame(game) {
  const { data, error } = await supabase
    .from('games')
    .upsert({ slug: game.slug, name: game.name }, { onConflict: 'slug' })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

async function importGame(game) {
  console.log(`\n=== ${game.name} ===`);
  const gameId = await upsertGame(game);

  const groups = await fetchJson(
    `https://tcgcsv.com/tcgplayer/${game.tcgcsvCategoryId}/groups`
  );
  console.log(`Found ${groups.length} sets`);

  const groupsToProcess = TEST_MODE ? groups.slice(0, 1) : groups;
  if (TEST_MODE) console.log('TEST MODE: only processing the first set');

  for (const group of groupsToProcess) {
    await sleep(DELAY_MS);
    console.log(`  Set: ${group.name}`);

    let products, prices;
    try {
      products = await fetchJson(
        `https://tcgcsv.com/tcgplayer/${game.tcgcsvCategoryId}/${group.groupId}/products`
      );
      await sleep(DELAY_MS);
      prices = await fetchJson(
        `https://tcgcsv.com/tcgplayer/${game.tcgcsvCategoryId}/${group.groupId}/prices`
      );
    } catch (err) {
      console.log(`    Skipped (fetch error): ${err.message}`);
      continue;
    }

    const singleCards = products.filter(isSingleCard);
    console.log(`    ${products.length} products, ${singleCards.length} identified as singles`);

    if (singleCards.length === 0) {
      console.log('    No singles found, skipping set (likely sealed-only or unrecognized field names)');
      continue;
    }

    // Upsert the set, now that we know the real single-card count
    const { data: setRow, error: setError } = await supabase
      .from('sets')
      .upsert(
        {
          game_id: gameId,
          name: group.name,
          set_code: group.abbreviation || null,
          total_cards: singleCards.length,
          release_date: group.publishedOn ? group.publishedOn.split('T')[0] : null,
        },
        { onConflict: 'game_id,name' }
      )
      .select()
      .single();

    if (setError) {
      console.log(`    Set upsert failed: ${setError.message}`);
      continue;
    }

    // Group ALL price rows per productId, since a card can have multiple
    // priced variants (Normal, Reverse Holofoil, etc) as separate rows here.
    const pricesByProductId = new Map();
    for (const p of prices) {
      if (!pricesByProductId.has(p.productId)) pricesByProductId.set(p.productId, []);
      pricesByProductId.get(p.productId).push(p);
    }

    let hiresMap = new Map();
    if (game.hiresSource) {
      hiresMap = await getHiresImageMap(game.hiresSource, group.name);
      if (hiresMap.size > 0) console.log(`    Hi-res matches available: ${hiresMap.size}`);
    }

    const cardRows = singleCards.map((product) => {
      const cardNumber = getExtendedValue(product, 'Number') || getExtendedValue(product, 'CardNumber');
      const hiresUrl = hiresMap.get(normalizeCardNumber(cardNumber));
      return {
        set_id: setRow.id,
        name: product.name,
        card_number: cardNumber,
        rarity: getExtendedValue(product, 'Rarity'),
        card_type: getExtendedValue(product, 'CardType') || getExtendedValue(product, 'Type'),
        image_url: hiresUrl || product.imageUrl || null,
        tcgcsv_product_id: String(product.productId),
      };
    });

    // Upsert cards in batches of 500
    const insertedCards = [];
    for (let i = 0; i < cardRows.length; i += 500) {
      const batch = cardRows.slice(i, i + 500);
      const { data, error } = await supabase
        .from('cards')
        .upsert(batch, { onConflict: 'tcgcsv_product_id' })
        .select();
      if (error) {
        console.log(`    Card batch upsert failed: ${error.message}`);
        continue;
      }
      insertedCards.push(...data);
    }

    // Insert price snapshots for cards we successfully upserted, one row
    // per variant (Normal, Reverse Holofoil, etc), not just one per card.
    const priceRows = [];
    for (const card of insertedCards) {
      const variantPrices = pricesByProductId.get(Number(card.tcgcsv_product_id)) || [];
      for (const vp of variantPrices) {
        if (vp.marketPrice == null) continue;
        priceRows.push({
          card_id: card.id,
          variant: vp.subTypeName || 'Normal',
          market_price: vp.marketPrice,
          low_price: vp.lowPrice,
          mid_price: vp.midPrice,
          high_price: vp.highPrice,
        });
      }
    }

    for (let i = 0; i < priceRows.length; i += 500) {
      const batch = priceRows.slice(i, i + 500);
      const { error } = await supabase.from('price_history').insert(batch);
      if (error) console.log(`    Price batch insert failed: ${error.message}`);
    }

    console.log(`    Imported ${insertedCards.length} cards, ${priceRows.length} prices`);
  }
}

async function importPalworldGame(game) {
  console.log(`\n=== ${game.name} ===`);
  const gameId = await upsertGame(game);

  let setsResp;
  try {
    const res = await fetch(`${PALWORLDTCG_BASE}/sets`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    setsResp = await res.json();
  } catch (err) {
    console.log(`  Sets fetch failed: ${err.message}`);
    return;
  }

  const sets = setsResp.data || [];
  console.log(`Found ${sets.length} sets`);

  const setsToProcess = TEST_MODE ? sets.slice(0, 1) : sets;
  if (TEST_MODE) console.log('TEST MODE: only processing the first set');

  for (const set of setsToProcess) {
    await sleep(DELAY_MS);
    const setCode = set.code || set.set_code;
    const setName = set.name || setCode;
    console.log(`  Set: ${setName}`);

    let setDetail;
    try {
      const res = await fetch(`${PALWORLDTCG_BASE}/sets/${setCode}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      setDetail = await res.json();
    } catch (err) {
      console.log(`    Skipped (fetch error): ${err.message}`);
      continue;
    }

    const cards = (setDetail.data && setDetail.data.cards) || [];
    // Only revealed, non-parallel base cards for now, keeps this consistent
    // with the rest of the catalog (one row per card, no alt-art duplicates).
    const baseCards = cards.filter((c) => (c.status || 'revealed') === 'revealed');

    if (baseCards.length === 0) {
      console.log('    No revealed cards yet, skipping set');
      continue;
    }

    const { data: setRow, error: setError } = await supabase
      .from('sets')
      .upsert(
        {
          game_id: gameId,
          name: setName,
          set_code: setCode || null,
          total_cards: baseCards.length,
          release_date: set.release_date || set.released_at || null,
        },
        { onConflict: 'game_id,name' }
      )
      .select()
      .single();

    if (setError) {
      console.log(`    Set upsert failed: ${setError.message}`);
      continue;
    }

    const cardRows = baseCards.map((card) => ({
      set_id: setRow.id,
      name: card.name,
      card_number: card.card_number || null,
      rarity: card.rarity || null,
      card_type: card.card_type || null,
      image_url: card.image_url || card.thumbnail_url || null,
      // No TCGCSV product exists for this game; namespace the palworldtcg.gg
      // slug into the same unique column the TCGCSV path uses, so upserts
      // still de-dupe cleanly without a schema change.
      tcgcsv_product_id: `palworldtcg:${card.slug}`,
    }));

    const insertedCards = [];
    for (let i = 0; i < cardRows.length; i += 500) {
      const batch = cardRows.slice(i, i + 500);
      const { data, error } = await supabase
        .from('cards')
        .upsert(batch, { onConflict: 'tcgcsv_product_id' })
        .select();
      if (error) {
        console.log(`    Card batch upsert failed: ${error.message}`);
        continue;
      }
      insertedCards.push(...data);
    }

    // No pricing source for Palworld yet, price_history intentionally skipped.
    console.log(`    Imported ${insertedCards.length} cards (no pricing source available yet)`);
  }
}

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'MXN', 'BRL'];

async function updateExchangeRates() {
  console.log('\n=== Exchange Rates ===');
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    if (json.result !== 'success' || !json.rates) {
      console.log('  Exchange rate fetch failed, keeping previous rates.');
      return;
    }
    const rows = SUPPORTED_CURRENCIES.map((code) => ({
      currency_code: code,
      rate: code === 'USD' ? 1 : json.rates[code] || null,
      updated_at: new Date().toISOString(),
    })).filter((r) => r.rate != null);

    const { error } = await supabase.from('exchange_rates').upsert(rows, { onConflict: 'currency_code' });
    if (error) console.log(`  Exchange rate upsert failed: ${error.message}`);
    else console.log(`  Updated ${rows.length} currency rates.`);
  } catch (err) {
    console.log(`  Exchange rate fetch error: ${err.message}`);
  }
}

async function checkForPalworldOnTcgcsv() {
  try {
    const res = await fetch('https://tcgcsv.com/tcgplayer/categories');
    if (!res.ok) return;
    const json = await res.json();
    const categories = json.results || [];
    const match = categories.find((c) => /palworld/i.test(c.name || ''));
    if (match) {
      console.log(`\n*** HEADS UP: TCGCSV now lists a "${match.name}" category (id ${match.categoryId}). ***`);
      console.log('*** Palworld pricing may now be available for free via TCGCSV. Update GAMES in import.js. ***\n');
    }
  } catch (err) {
    console.log(`  (Palworld/TCGCSV check skipped: ${err.message})`);
  }
}

async function main() {
  await checkForPalworldOnTcgcsv();
  await updateExchangeRates();
  for (const game of GAMES) {
    if (game.source === 'palworldtcg') {
      await importPalworldGame(game);
    } else {
      await importGame(game);
    }
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
