# Release Notes

## v0.9.5 (2026-07-23)

Small follow-up round, no database changes.

**Added:**
- Clicking the profile picture shows a small "Custom avatars coming soon" overlay directly over the avatar circle. Click anywhere to dismiss.

**Fixed:**
- Layout gaps: the page is now capped and centered at a max width, so the left↔center and center↔right column gaps read as equal instead of the right gap drifting wider on large screens.
- Top Card highlight box styling restored (background, border, padding), and its width is now synced to match the Recently Added grid and header exactly, so all three line up on the same right edge.

## v0.9 (2026-07-22)

Fixed Recently Added header/dropdown width alignment. Added a right-hand Dashboard profile panel with display+edit modes, defaulting to OAuth sign-in name/avatar, storing age/location/gender/favorite-set in a new user_profiles table. Moved Set Completion into the left sidebar below the 3 static stat cards and made it drag-to-reorder with persisted order via a new sort_order column on user_master_sets.

## v0.8 (2026-07-22)

Replaced an earlier centered-row fix for Recently Added with a better approach: grid now picks a column count that divides evenly into the number of cards shown.

## v0.7 (2026-07-22)

Catch-up release formalizing two loose-file Dashboard tweaks: Top Card highlight moved into the right column, resized/reframed without the container box.

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
