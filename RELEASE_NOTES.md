# Release Notes

## v0.13 (2026-07-25)

**Fixed:**
- Card detail modal image was getting vertically compressed. Root cause: the "Your copy" fields added in v0.11 made the header's text column taller, and flexbox's default stretch behavior squished the image to match. Added `align-items: flex-start` to fix it.
- First real mobile responsiveness pass across all three pages. Topbars now wrap instead of overflowing, the Dashboard's 3-column layout collapses to a single column on narrow screens, the card detail modal stacks its image above the text instead of squeezing both side by side, and a few other narrow-screen fixes. This is a first pass, not an exhaustive one, more polish may be needed.

**Changed:**
- Purchase Price removed from the card detail modal. Replaced with a proper sealed-product purchase log on the Dashboard: pick a set, a product type (Booster Box, Elite Trainer Box, Blister Pack, Bundle, Tin, or Other), and the price paid. This now feeds the Spent vs. value chart instead of per-card price. A running list of your last 10 logged purchases shows underneath, each removable.
- New `product_purchases` table. The old `purchase_price` column on `user_collection` is left in place harmlessly (no longer used by the UI).

**Setup required:**
- Run `schema_addition_v9.sql` in Supabase (adds `product_purchases` table)

## v0.12 (2026-07-25)

Added a new Binders page, binder assignment on the detail panel.

## v0.11 (2026-07-25)

Added purchase price field + spend-vs-value line chart on the Dashboard.

## v0.10 (2026-07-24)

Added Estimated Grade + Trade Available fields on owned cards.

## v0.9.8 (2026-07-24)

Bumped card detail panel image 170px -> 240px.

## v0.9.7 (2026-07-24)

Sized up card thumbnails.

## v0.9.6 (2026-07-23)

Fixed Recently Added / Top Card spacing properly.

## v0.9.5 (2026-07-23)

Added avatar "coming soon" overlay, layout gap fix, restored Top Card box styling.

## v0.9 (2026-07-22)

Added a right-hand Dashboard profile panel, drag-to-reorder Set Completion.

## v0.8 (2026-07-22)

Recently Added grid alignment fix.

## v0.7 (2026-07-22)

Catch-up release: Top Card highlight repositioned/resized.

## v0.6 (2026-07-21)

CSV import/export, Top Card highlight section.

## v0.5 (2026-07-21)

Variant/subtype price tracking fix, full card detail panel, Discord/GitHub/email sign-in.

## v0.4 (2026-07-21)

Dashboard Recently Added widget, Collection page restructured, GitHub Actions price automation.

## v0.3 (2026-07-21)

Fixed sign-in collision bug, fixed duplicate dropdown bug, added card images, full brand redesign.

## v0.2 (2026-07-21)

Added Collection page.

## v0.1 (2026-07-21)

First working version.
