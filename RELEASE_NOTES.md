# Release Notes

## v0.9.8 (2026-07-24)

**Changed:**
- Card detail panel image bumped up again: 170px → 240px. Confirmed the underlying high-res images (from the pokemontcg.io/Scryfall/Lorcast import) run around 734x1024px, so there's plenty of resolution headroom for this size without any quality loss.

## v0.9.7 (2026-07-24)

Sized up card thumbnails to actually take advantage of the high-res images imported earlier. Collection search result thumbnails: 44px -> 64px. Card detail panel image: 120px -> 170px.

## v0.9.6 (2026-07-23)

Fixed Recently Added / Top Card spacing properly, removed the pixel-width syncing hack and replaced it with cards that stretch evenly to fill the actual column width.

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
