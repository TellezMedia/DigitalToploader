# Release Notes

## v0.4 (2026-07-21)

Big batch, full backlog cleared in one push.

**Dashboard (`index.html`):**
- Added a **Recently added** section above Set Completion, showing your last 50 additions with a sort-by dropdown: Date added (default), Rarity, or Value. Cards show thumbnail (clickable, opens the lightbox), name, set, and rarity, with price if available.
- Set Completion cards now show an owned/total fraction (e.g. "34/122 cards · 28%") alongside the percentage, and the progress bar itself is thicker/more prominent.
- Fixed the "duplicate master set widget" bug (e.g. Pitch Black showing twice): `loadDashboard()` was re-running every time Supabase's auth state fired, which can happen more than once on page load. Now only runs once per real sign-in.

**Collection page (`collection.html`):**
- **Restructured "My Collection"** into a two-level collapsible hierarchy: collapsible **Game** sections (Pokemon/MTG/Lorcana) containing expandable **Sets** within each game. Expanding a set reveals your owned cards as a thumbnail gallery (click any thumbnail for the full-size lightbox), replacing the old flat grouped-by-set-only list.
- **Quantity can now be edited in place** directly on each card tile, no more remove-and-re-add just to fix a count.
- **Card value + trend arrow** now shown on each owned card, green up-arrow / red down-arrow comparing the latest price snapshot to the previous one. Arrows won't appear until there are at least two real price snapshots for a card (see the price automation below), that's expected, not a bug.
- **Enter key now triggers search** in both the card name and card number fields, no more forced click on the Search button, as long as the field isn't empty.
- **Search by card number** added, but only once a set is selected (card numbers aren't unique across sets/games). Trying to search by number without a set chosen shows a small toast telling you to pick a set first.

**Price automation:**
- Added `.github/workflows/update-prices.yml`, a scheduled GitHub Actions workflow that re-runs the TCGCSV import automatically every night, so `price_history` actually accumulates real snapshots over time instead of only updating when you remember to run the script by hand.
- `scripts/import.js` updated to read Supabase credentials from environment variables (GitHub Actions secrets) instead of hardcoded values, so no real secret key ever lives in the repo itself.
- **Setup required**: add two repository secrets in GitHub (Settings > Secrets and variables > Actions): `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

**Database:**
- New `schema_addition_v2.sql`: adds the `price_trends` view (latest price vs. previous snapshot per card), powering the trend arrows above.

**Note on "Master Set tracking" (backlog item 3):** this already existed as of v0.2 via the Master Set checkbox on the Collection page. No separate feature was needed, the checkbox plus the new gallery restructure above covers it.

## v0.3 (2026-07-21)

**Fixed:**
- Sign-in was completely broken on the live site due to a variable naming collision (our code declared `supabase`, which collided with the global the Supabase CDN library itself creates). Renamed to `supabaseClient` throughout both pages.
- Game filter dropdown on the Collection page was showing every game duplicated. `loadGames()` runs on every auth state change (which can fire more than once), and wasn't clearing old options first. Now resets to just "All games" before repopulating.

**Added:**
- Card thumbnail images on both the Browse & Add search results and the My Collection list, pulling from `image_url` in the catalog (falls back to a dashed placeholder box if a card has no image)
- Brand wordmark ("Digital TopLoader.com") added to the top nav bar on both Dashboard and Collection pages

**Redesigned:**
- Full brand color palette applied across both pages, replacing the placeholder dark/amber theme: navy (#14213D) background, electric blue (#2E86FF) and light blue (#39D0FF) accents, gold (#F6C453) highlights, matching the official Digital TopLoader logo/brand sheet
- Sign-in screen rebuilt: logo frame placeholder (icon TBD until real logo files are ready), tricolor wordmark, tagline, and a proper Google sign-in button with real Google icon colors (previously a generic outline button)

**SEO:**
- Page titles updated: `index.html` is now "Digital TopLoader – TCG Collection Tracker & Portfolio Value", `collection.html` is "Digital TopLoader – Collection Manager"

## v0.2 (2026-07-21)

**Added:**
- `collection.html` - Browse & add cards (filter by game/set, search by name, add with quantity), and My Collection view grouped by set, each set with its own **Master set** checkbox
- Nav links added between Dashboard and Collection on both pages

**Behavior notes:**
- Adding a card already in your collection (same card, default condition/variant/language) increases its quantity rather than creating a duplicate row
- Checking "Master set" on a set immediately flags it for the Dashboard's Set Completion grid, unchecking removes it from that grid without deleting any card data
- Card search with no game/set filter searches the entire multi-game catalog by name

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
