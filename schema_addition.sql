# Release Notes

## v0.5 (2026-07-21)

Full remaining backlog cleared: variant/pricing fix, card detail panel, new sign-in options, Dashboard button.

**Variant/pricing fix (the big one):**
- `price_history` now tracks a `variant` column (Normal, Reverse Holofoil, etc), plus `mid_price` and `high_price`. Previously the import script only kept one price per card and silently discarded other variants (that's why Reverse Holofoil Snivy from Perfect Order wasn't showing up).
- `scripts/import.js` rewritten to capture every priced variant per card instead of overwriting down to one.
- `latest_prices` and `price_trends` views rebuilt to be variant-aware.
- **Schema migration required**: run `schema_addition_v3.sql`, then re-run the import (locally or via the GitHub Actions workflow) to actually populate variant data. Existing cards will show only their previously-captured variant until the next import run.

**Card detail panel (Collection page):**
- Clicking any card thumbnail now opens a full detail panel instead of just a bigger image: card info (set, rarity, number, type, release date), market price with a link to TCGPlayer, a free PriceCharting search link, a pricing breakdown showing every variant with its own bar and low/mid/market prices, grading & population report links (PSA/BGS/CGC, external links only, not live data), and Add to Collection / Wishlist / Alert buttons right in the panel.
- Wishlist and Alert buttons are now functional, toggling rows in `user_wishlist` and `user_watchlist`. Alert prompts for a target price.
- Search results with multiple variants now show a variant picker before adding.
- Note: this rich detail panel is on the Collection page only. The Dashboard's "Recently Added" thumbnails still use the simple full-image lightbox, kept simple deliberately to bound scope, can be upgraded to the same panel later if wanted.

**New sign-in options (both pages):**
- Email/password sign-up added alongside Google, with its own form and a sign-in/sign-up toggle.
- Discord and GitHub sign-in buttons added. **Both require setup in Supabase before they'll work** (see setup steps below).

**Dashboard:**
- New "+ Add to Collection" button in the top bar, brand-gradient styled, links straight to the Collection page.
- Portfolio value and Recently Added pricing now correctly match the specific variant each card was added as, instead of always grabbing whichever price row came back first.

## Setup required after this release

1. **Run `schema_addition_v3.sql`** in Supabase SQL Editor.
2. **Re-run the price import** (local `node import.js` or trigger the GitHub Actions workflow manually) so variant data actually populates.
3. **Enable Discord sign-in**: create an application at discord.com/developers, add an OAuth2 redirect pointing to your Supabase callback URL, then enable Discord in Supabase Authentication > Providers with that Client ID/Secret.
4. **Enable GitHub sign-in**: create an OAuth App at github.com/settings/developers, same pattern, then enable GitHub in Supabase Authentication > Providers.
5. **Confirm Email provider is on** in Supabase Authentication > Providers (usually on by default, worth a quick check).

## v0.4 (2026-07-21)

Dashboard Recently Added widget with sort, richer set completion bars, duplicate-master-set dashboard bug fix, Collection page restructured into collapsible Game>Set hierarchy with lightbox gallery, in-place quantity editing, price+trend arrows, Enter-to-search, card number search restricted to when a set is chosen, and GitHub Actions nightly price automation.

## v0.3 (2026-07-21)

Fixed sign-in collision bug, fixed duplicate dropdown bug, added card images, full brand redesign (Digital TopLoader palette), SEO title updates.

## v0.2 (2026-07-21)

Added Collection page (browse/search/add cards, Master set checkbox), nav links between pages.

## v0.1 (2026-07-21)

First working version: dashboard, schema, Google auth, full Pokemon/MTG/Lorcana catalog import.
