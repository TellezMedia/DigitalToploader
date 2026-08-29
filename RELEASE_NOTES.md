# Release Notes

Two parallel version tracks from here on: v0.2x for the core app (catalog,
collection, pricing), v0.5x for the social layer (alpha/beta). They release
independently.

## v0.23 (core app)

**Added:**
- "Recently added" on the Dashboard now shows 20 cards instead of 10.
- Set Completion sidebar now caps at 6 sets by default with a "Show all (N)" link to expand, so it stops running far past the Recently Added section as more sets get tracked. Drag-to-reorder still works the same within whatever's currently visible.

## v0.22 (core app)

**Added:**
- Custom Master Sets: track your own collecting goal (e.g. "every Pikachu," "every Secret Rare in a set") instead of only real printed sets. Click "+ Custom" next to the new "Custom master sets" section on the Dashboard, pick a game and a filter (card name contains / card type / rarity, with type and rarity populated live from the actual catalog), name it, and it shows up with a progress bar just like a real Master Set. Click one to open the same checklist view (greyed-out unowned cards, click to quick-add). Delete with the × on the card.

**Fixed:**
- `index.html` has its own separate copy of the card detail modal and checklist overlay from `collection.html`, not shared code. Two things from recent sessions had only been fixed in `collection.html` and were missed here: click-outside-to-close (now added to both the card detail and set checklist overlays in `index.html` too), and the binder page/slot fields (now present in `index.html`'s card detail modal as well, not just `collection.html`'s).
- Rarity badge now also shows on the enlarged card image inside the detail modal, not just grid thumbnails, in both files.

**Setup required after this release:**
1. Run `schema_addition_v11.sql` in Supabase SQL Editor (adds `custom_master_sets` table and two views, `distinct_card_types`/`distinct_card_rarities`, that power the filter dropdowns).
2. No import re-run needed, no catalog data touched.

## v0.21 (core app)

**Added:**
- Rarity/parallel badge on every card thumbnail (collection grid, View All, dashboard Recently Added), using standard TCG acronym shorthand mapped from the actual rarity values across all 8 games. Overlap between games (e.g. two different "SR" meanings) is expected and fine, set/game context disambiguates it.
- "View All" now shows unowned cards too, for any set flagged "Master set." Unowned cards render greyed out; clicking one adds it to your collection and un-greys it in place. Non-master sets are unaffected, owned cards only, same as before.
- Binder page and slot number fields on the card detail modal, alongside the existing binder picker.
- "Log a Purchase": new "Source" field (where you bought it), plus an "Export to Excel" button that downloads every logged purchase with a Total Spend row at the bottom.

**Setup required after this release:**
1. Run `schema_addition_v10.sql` in Supabase SQL Editor (adds `binder_page`/`binder_slot` to `user_collection`, `source` to `product_purchases`).
2. No import re-run needed, no catalog data touched.

## v0.50 (2026-08-28) — social layer, alpha

**Added:**
- Profile page (`profile.html`): shows your card/set/follower/following counts, username, and a public/private toggle. Public profiles are discoverable by username search; private ones aren't.
- Follow-request system: search for a collector by username, send a follow request, the recipient sees it under "Follow requests" on their own profile and can accept or deny. Until accepted, the requester sees only the target's name/avatar and basic stats, no posts (posts don't exist yet, this is the access-control groundwork for when they do).
- Account menu moved: the topbar now shows your Google account name (and avatar, when Google provides one) instead of your email, click it to reveal Profile and Sign out. Theme and currency selectors stay as separate standalone controls.

**Not in this build (later phases):** the actual Feed and Log/Showcase/Review post types, the 3-column social shell from the wireframes (left nav + feed + right sidebar), comments, and the trading-interest toggle. Tonight is profile + follow mechanic only, on top of the existing page layout.

**Setup required after this release:**
1. Run `schema_addition_v8.sql` in Supabase SQL Editor (adds `username`/`is_public` to `user_profiles`, adds the `follows` table with RLS policies).
2. No import re-run needed, this doesn't touch the catalog pipeline.

## v0.20 (2026-08-24)

**Fixed:**
- Palworld card images were saving as broken links (e.g. `digitaltoploader.com/img/card-images/official/PROMO/SOUL-007.png` instead of the real image on palworldtcg.gg). palworldtcg.gg's API returns some image paths as site-relative rather than full URLs; the import now resolves those against palworldtcg.gg's own domain before saving, instead of storing the path as-is. A re-import is needed to backfill the correct URLs on existing Palworld cards.
- CSV collection import now accepts common alternate header names ("Name"/"Number" as well as "Card Name"/"Card Number"), and normalizes language codes like "en"/"ja" to "English"/"Japanese". This specifically fixes importing palworldtcg.gg's own collection-export CSV, which uses those column names and codes, previously every row silently failed to match since the importer only recognized its own exact template headers.
- Palworld catalog import now pulls from the `/cards` endpoint with `include_parallels=true` instead of `/sets/{code}`, so alt-art parallel cards (e.g. `BP01-001-OSR`) are actually in the catalog. These parallel card numbers are what appear in palworldtcg.gg's own CSV export, so without this fix those rows could never match regardless of the header fix above.
- `scripts/import.js` now actually includes the 4 new TCGs (One Piece, Digimon, Star Wars: Unlimited, Flesh and Blood) in its `GAMES` config with correct TCGCSV category IDs. Previous sessions built and confirmed this, but it never made it into the committed script, that's why the "Browse & add cards" game dropdown was only showing 3 games. Root `package.json` was also corrupted (an accidental duplicate of `import.js`), now restored as a real manifest.
- Rebuilt the pokemontcg.io/Scryfall/Lorcast hi-res image lookup in `import.js` from scratch, it had also never made it into the repo despite being confirmed working in an earlier session. Set-name matching now includes a fallback containment match, which also fixes promo sets failing to match due to inconsistent naming across sources (e.g. "Scarlet & Violet Black Star Promos" vs "Promos").

**Added:**
- Quantity on each collection card is now a locked display with +/− buttons instead of a typeable number box, no more deleting and retyping to bump a count when you pick up a duplicate. Hitting − at 1 removes the card, same as the × button.
- Three ways to recover from a bad import or clean up your collection: "Undo last import" (shows up automatically after any CSV import, reverses exactly that batch, newly added cards are deleted, quantities bumped by that import are rolled back, nothing else is touched), a "Select" mode with per-card checkboxes and "Select all" for bulk-deleting a chosen set of cards, and a "Clear Collection" option that wipes everything (requires typing DELETE to confirm, since it's irreversible).
- CSV import now opens a modal when you click "Import CSV," pick which site the file came from (Digital TopLoader template / palworldtcg.gg export / Other), then choose the file, instead of a separate dropdown sitting next to the button. Same underlying source-specific column mapping as before, just a clearer flow. More sources can be added once a real sample export is available to confirm their column names.
- Every daily import run now checks TCGCSV's own category list for a "Palworld" entry and logs a clear heads-up if one appears (visible in the GitHub Action's run log). That would mean free pricing is finally available through the same pipeline as the other 7 games, still needs a manual code update to wire it in, but you'll know the moment it's possible without checking manually.
- Palworld TCG catalog support, pulled from the fan-run palworldtcg.gg public API (free, no key, no auth) since TCGCSV doesn't carry this game. No pricing data available from this source yet, cards import with catalog info and images only; pricing will follow once a real source (PriceCharting's official API, once subscribed, or TCGCSV if TCGPlayer ever adds it) is in place.
- Regional currency conversion: pick a currency from the dropdown in the topbar (USD, EUR, GBP, CAD, AUD, JPY, MXN, BRL), every displayed price converts on the fly. Underlying data stays USD, rates are fetched daily during the import run from open.er-api.com and cached in a new `exchange_rates` table, so pages don't hit a live rate API.
- Language variant tracking: cards can now be added to your collection as English or Japanese. New `language` column on `user_collection` (defaults to English for existing rows). Language selector appears next to the variant picker when adding a card, shows as a small badge on non-English cards in the collection view, and round-trips through CSV export/import/template.
- "View All" per game: click the new link next to a game's set count (e.g. "Pokemon · 20 sets · 116 cards") to open a flat gallery of every owned card across all that game's sets in one scrollable view, grouped and sorted by set name.
- Theme overhaul: cool, blue-tinted grey palette replaces the previous saturated blue background across all three pages. Logo and accent colors stay blue. New dark/light toggle in the topbar (moon/sun icon), defaults to dark, choice persists across visits via localStorage.

**Setup required after this release:**
1. Run `schema_addition_v6.sql`, `schema_addition_v7.sql`, and `schema_addition_v9.sql` in Supabase SQL Editor (adds the `language` column, `exchange_rates` table, and `import_batches`/`import_batch_items` tables for the undo feature). See `SCHEMA_INDEX.md` for the full migration history at a glance.
2. Re-run the catalog import (`node scripts/import.js`, locally or via the GitHub Actions workflow) to actually populate the 4 new games' cards, backfill hi-res images, and populate the first set of exchange rates. This is a long run, similar to the original import.
3. Optional: set a `POKEMONTCG_API_KEY` repo secret to raise pokemontcg.io's rate limit from 1,000/day to 20,000/day.

**Housekeeping:**
- Older `schema_addition*.sql` files marked with an "already applied" header comment so it's clear at a glance which migrations are historical vs. still pending.

## v0.17 (2026-07-26)

**Added:**
- Set Completion widgets now grouped by game (Pokemon, Magic, Lorcana, etc. each as their own section) instead of one mixed list. Drag-to-reorder still works, scoped within each game's own section.
- Master Set Checklist: click any Set Completion widget to open a full visual checklist, every card+variant in that set as a thumbnail, sorted by card number. Owned cards show in full color, unowned ones are grayscale and clickable to quick-add (turns color immediately). Web only.
- 4 new TCGs added to the catalog: One Piece Card Game, Digimon Card Game, Star Wars: Unlimited, Flesh and Blood. (Lord of the Rings TCG dropped, not actually a tracked TCGCSV category. Palworld checked again post-launch, still not listed either.)

**Fixed (import script):**
- Both fetch helper functions now time out after 20 seconds instead of hanging silently forever on an unresponsive request.

**Setup required:**
- No schema changes for the app itself
- The import script needs a full re-run to pull in the 4 new games' catalogs (a long run, similar to the original import)

## v0.16 (2026-07-26)

Bumped topbar logo height from 28px to 48px.

## v0.15 (2026-07-26)

Embedded real logo, favicon, and app icon assets across all three pages.
