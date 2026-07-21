# Release Notes

## v0.2 (2026-07-21)

**Added:**
- `collection.html` - Browse & add cards (filter by game/set, search by name, add with quantity), and My Collection view grouped by set, each set with its own **Master set** checkbox
- Nav links added between Dashboard and Collection on both pages

**Behavior notes:**
- Adding a card already in your collection (same card, default condition/variant/language) increases its quantity rather than creating a duplicate row
- Checking "Master set" on a set immediately flags it for the Dashboard's Set Completion grid, unchecking removes it from that grid without deleting any card data
- Card search with no game/set filter searches the entire multi-game catalog by name

**Known limitations:**
- No way yet to add a card with non-default condition/variant/language (everything added assumes Near Mint, English, no variant) directly from search, only via future editing
- No edit-in-place for quantity/condition on owned cards yet, only remove and re-add
- Set completion percentage on the Dashboard counts unique cards owned vs. total singles in the set, not accounting for variants (e.g. holo vs non-holo of the same card number)

## v0.1 (2026-07-21)

First working version of the digitaltoploader TCG tracker.

**Included:**
- `index.html` - dashboard with Google sign-in (via Supabase Auth), live portfolio value, unique/total card counts, and a dynamically-growing Set Completion grid based on flagged "Master sets"
- `tcg_tracker_schema_v0.1.sql` - initial database schema: games, sets, cards, price_history, user_collection, user_master_sets, user_wishlist, user_watchlist, with Row Level Security so each user only sees their own data
- `schema_addition.sql` - two unique constraints (sets: game_id+name, cards: tcgcsv_product_id) required for the catalog import script's upsert logic

**Status:**
- Supabase project connected (digitaltoploader.com backend)
- Google OAuth configured
- Full Pokemon, MTG, and Lorcana catalog imported from TCGCSV (games/sets/cards/prices populated)
- `user_collection` is still empty, no cards added to any personal collection yet
- Collection page (where cards get added, and the "Master set" checkbox lives) not yet built

**Known limitations:**
- Dashboard will show $0 / 0 cards / "No master sets flagged yet" until the Collection page exists and cards get added
- Set completion query runs one lookup per master set, fine for a handful of sets, worth optimizing if someone tracks dozens
- Some very new 2026 card releases have no price data yet (expected, not a bug, TCGplayer market price needs sales history to exist)
