# Release Notes

## v0.10 (2026-07-24)

**Added:**
- Estimated Grade (manual entry, e.g. 9.5) and Available for Trade toggle, shown in the card detail panel for cards you actually own (My Collection, Recently Added, Top Card highlight). Not shown when browsing/searching cards you don't own yet, since there's nothing to grade.
- New `estimated_grade` and `trade_available` columns on `user_collection`.

**Changed:**
- Moved the "Add to Collection" button from the Dashboard topbar to directly under the profile panel on the right.

**Setup required:**
- Run `schema_addition_v6.sql` in Supabase (adds the two new columns)

## v0.9.8 (2026-07-24)

Bumped card detail panel image 170px -> 240px.

## v0.9.7 (2026-07-24)

Sized up card thumbnails: Collection search 44px -> 64px, detail panel 120px -> 170px.

## v0.9.6 (2026-07-23)

Fixed Recently Added / Top Card spacing properly, cards stretch evenly to fill actual column width.

## v0.9.5 (2026-07-23)

Added avatar "coming soon" overlay. Capped/centered page width for equal column gaps. Restored Top Card highlight box styling.

## v0.9 (2026-07-22)

Fixed Recently Added header/dropdown width alignment. Added a right-hand Dashboard profile panel with display+edit modes. Moved Set Completion into the left sidebar, made it drag-to-reorder with persisted order.

## v0.8 (2026-07-22)

Replaced an earlier centered-row fix for Recently Added with a better approach: grid picks a column count that divides evenly into the number of cards shown.

## v0.7 (2026-07-22)

Catch-up release formalizing two loose-file Dashboard tweaks: Top Card highlight moved into the right column, resized/reframed.

## v0.6 (2026-07-21)

CSV import/export on the Collection page, plus a Dashboard "Top card in your collection" highlight section.

## v0.5 (2026-07-21)

Variant/subtype price tracking fix, full card detail panel, Discord/GitHub/email sign-in, brand-gradient Add to Collection button.

## v0.4 (2026-07-21)

Dashboard Recently Added widget with sort, richer set completion bars, Collection page restructured into collapsible Game>Set hierarchy, GitHub Actions nightly price automation.

## v0.3 (2026-07-21)

Fixed sign-in collision bug, fixed duplicate dropdown bug, added card images, full brand redesign, SEO title updates.

## v0.2 (2026-07-21)

Added Collection page (browse/search/add cards, Master set checkbox), nav links between pages.

## v0.1 (2026-07-21)

First working version: dashboard, schema, Google auth, full Pokemon/MTG/Lorcana catalog import.
