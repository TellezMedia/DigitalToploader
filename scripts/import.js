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
  { slug: 'pokemon', name: 'Pokemon', tcgcsvCategoryId: 3 },
  { slug: 'mtg', name: 'Magic: The Gathering', tcgcsvCategoryId: 1 },
  { slug: 'lorcana', name: 'Disney Lorcana', tcgcsvCategoryId: 71 },
];

const TEST_MODE = process.argv.includes('--test');
const DELAY_MS = 300; // pause between requests, be polite to a free hobby-run service

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      console.log(
