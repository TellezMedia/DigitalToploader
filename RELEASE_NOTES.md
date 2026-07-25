# Release Notes

## v0.11 (2026-07-25)

**Added:**
- Purchase price field, alongside Estimated Grade and Trade Available, on owned cards
- Spend vs. value chart on the Dashboard (under the profile panel): a line showing cumulative amount spent over time, with a dashed reference line at your current portfolio value, plus a Spent/Value/Gain-or-Loss summary. Shows an empty-state message if no cards have a purchase price yet.
- New `purchase_price` column on `user_collection`.

**Fixed:**
- The "Your copy" fields (Purchase price, Grade, Trade Available) were sitting in their own section far down the detail panel, leaving a large empty gap next to the card image up top. Moved them into that empty space instead, right below the set name.

**Setup required:**
- Run `schema_addition_v7.sql` in Supabase (adds `purchase_price`)

## v0.10 (2026-07-24)

Added Estimated Grade + Trade Available fields on owned cards. Moved Add to Collection button from topbar to under the profile panel.

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

Replaced an earlier centered-row fix for Recently Added with a better approach.

## v0.7 (2026-07-22)

Catch-up release: Top Card highlight moved into the right column, resized/reframed.

## v0.6 (2026-07-21)

CSV import/export on the Collection page, plus a Dashboard Top Card highlight section.

## v0.5 (2026-07-21)

Variant/subtype price tracking fix, full card detail panel, Discord/GitHub/email sign-in.

## v0.4 (2026-07-21)

Dashboard Recently Added widget with sort, Collection page restructured into collapsible Game>Set hierarchy, GitHub Actions nightly price automation.

## v0.3 (2026-07-21)

Fixed sign-in collision bug, fixed duplicate dropdown bug, added card images, full brand redesign.

## v0.2 (2026-07-21)

Added Collection page (browse/search/add cards, Master set checkbox), nav links between pages.

## v0.1 (2026-07-21)

First working version: dashboard, schema, Google auth, full Pokemon/MTG/Lorcana catalog import.
