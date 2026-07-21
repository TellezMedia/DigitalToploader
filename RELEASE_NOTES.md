# Release Notes

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

**Next up:** Build the Collection page (browse/add cards, quantity, condition, and the Master set checkbox).
