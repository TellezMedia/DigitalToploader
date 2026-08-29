# Release Notes

Two parallel version tracks from here on: v0.2x for the core app (catalog,
collection, pricing), v0.5x for the social layer (alpha/beta). They release
independently.

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
- CSV collection import now accepts common alternate header names ("Name"/"Number" as well as "Card Name"/"Card Number"), and normalizes language codes like "en"/"ja" to "English"/"Japanese". This specifically fixes importing palworldtcg.gg's own collection-export CSV, which uses those column names and codes, previously every row silently failed to match since the importer only recognized its own exact template headers.
- Palworld catalog import now pulls from the `/cards` endpoint with `include_parallels=true` instead of `/sets/{code}`, so alt-art parallel cards (e.g. `BP01-001-OSR`) are actually in the catalog. These parallel card numbers are what appear in palworldtcg.gg's own CSV export, so without this fix those rows could never match regardless of the header fix above.
- `scripts/import.js` now actually includes the 4 new TCGs (One Piece, Digimon, Star Wars: Unlimited, Flesh and Blood) in its `GAMES` config with correct TCGCSV category IDs. Previous sessions built and confirmed this, but it never made it into the committed script, that's why the "Browse & add cards" game dropdown was only showing 3 games. Root `package.json` was also corrupted (an accidental duplicate of `import.js`), now restored as a real manifest.
- Rebuilt the pokemontcg.io/Scryfall/Lorcast hi-res image lookup in `import.js` from scratch, it had also never made it into the repo despite being confirmed working in an earlier session. Set-name matching now includes a fallback containment match, which also fixes promo sets failing to match due to inconsistent naming across sources (e.g. "Scarlet & Violet Black Star Promos" vs "Promos").

**Added:**
- Every daily import run now checks TCGCSV's own category list for a "Palworld" entry and logs a clear heads-up if one appears (visible in the GitHub Action's run log). That would mean free pricing is finally available through the same pipeline as the other 7 games, still needs a manual code update to wire it in, but you'll know the moment it's possible without checking manually.
- Palworld TCG catalog support, pulled from the fan-run palworldtcg.gg public API (free, no key, no auth) since TCGCSV doesn't carry this game. No pricing data available from this source yet, cards import with catalog info and images only; pricing will follow once a real source (PriceCharting's official API, once subscribed, or TCGCSV if TCGPlayer ever adds it) is in place.
- Regional currency conversion: pick a currency from the dropdown in the topbar (USD, EUR, GBP, CAD, AUD, JPY, MXN, BRL), every displayed price converts on the fly. Underlying data stays USD, rates are fetched daily during the import run from open.er-api.com and cached in a new `exchange_rates` table, so pages don't hit a live rate API.
- Language variant tracking: cards can now be added to your collection as English or Japanese. New `language` column on `user_collection` (defaults to English for existing rows). Language selector appears next to the variant picker when adding a card, shows as a small badge on non-English cards in the collection view, and round-trips through CSV export/import/template.
- "View All" per game: click the new link next to a game's set count (e.g. "Pokemon · 20 sets · 116 cards") to open a flat gallery of every owned card across all that game's sets in one scrollable view, grouped and sorted by set name.
- Theme overhaul: cool, blue-tinted grey palette replaces the previous saturated blue background across all three pages. Logo and accent colors stay blue. New dark/light toggle in the topbar (moon/sun icon), defaults to dark, choice persists across visits via localStorage.

**Setup required after this release:**
1. Run `schema_addition_v6.sql` and `schema_addition_v7.sql` in Supabase SQL Editor (adds the `language` column and `exchange_rates` table). See `SCHEMA_INDEX.md` for the full migration history at a glance.
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
