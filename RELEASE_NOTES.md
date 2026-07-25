# Release Notes

## v0.12 (2026-07-25)

**Added:**
- New Binders page (`binders.html`): create binders with a name/number, brand (Ultra PRO, Dragon Shield, Vault X, BCW, Ultimate Guard, or Other with free text), and a free color picker. Shows a grid of your binders with card counts, click into one to see its assigned cards and remove any if needed.
- "Binders" link added to the Dashboard and Collection nav.
- Binder assignment added to the "Your copy" section in the card detail panel (both Dashboard and Collection), pick a binder from a dropdown and Save alongside grade/trade/purchase price.
- New `binders` table and `binder_id` column on `user_collection`.

**Setup required:**
- Run `schema_addition_v8.sql` in Supabase
- Upload `binders.html` (new file) along with the updated `index.html` and `collection.html`

## v0.11 (2026-07-25)

Added purchase price field + spend-vs-value line chart on the Dashboard. Fixed a layout gap by moving the "Your copy" fields into the empty header space next to the card image.

## v0.10 (2026-07-24)

Added Estimated Grade + Trade Available fields on owned cards. Moved Add to Collection button from topbar to under the profile panel.

## v0.9.8 (2026-07-24)

Bumped card detail panel image 170px -> 240px.

## v0.9.7 (2026-07-24)

Sized up card thumbnails: Collection search 44px -> 64px, detail panel 120px -> 170px.

## v0.9.6 (2026-07-23)

Fixed Recently Added / Top Card spacing properly.

## v0.9.5 (2026-07-23)

Added avatar "coming soon" overlay. Capped/centered page width for equal column gaps.

## v0.9 (2026-07-22)

Added a right-hand Dashboard profile panel. Moved Set Completion into the left sidebar, made it drag-to-reorder.

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
