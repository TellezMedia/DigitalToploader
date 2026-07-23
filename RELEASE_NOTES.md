# Release Notes

## v0.9 (2026-07-22)

**Fixed:**
- Recently Added sort dropdown: header row now dynamically matches the grid's actual rendered width, so the dropdown's right edge lines up with the grid's right edge instead of drifting to the full column width.

**Added:**
- Right-hand profile panel on the Dashboard (new third column). Display mode shows avatar, display name, age, location, gender, and favorite TCG/set, cleanly laid out, skipping any fields you haven't filled in. Defaults to your Google/Discord/GitHub sign-in name and avatar on first load. Edit mode (pencil icon) switches to real labeled form fields with Save/Cancel.
- Drag-to-reorder Set Completion widgets. Moved from the main content area into the left sidebar, directly below the three static stat cards (Portfolio Value, Unique Cards, Total Cards, which never move), separated by a divider. Custom order persists across visits.

**Setup required:**
- Run `schema_addition_v4.sql` in Supabase (adds the `user_profiles` table)
- Run `schema_addition_v5.sql` in Supabase (adds `sort_order` column to `user_master_sets`)

## v0.8 (2026-07-22)

Replaced an earlier centered-row fix for Recently Added, which didn't fit the site's left-heavy layout, with a better approach: grid now picks a column count that divides evenly into the number of cards shown, extending to additional rows as needed rather than leaving any partial row.

## v0.7 (2026-07-22)

Catch-up release formalizing two loose-file Dashboard tweaks: Top Card highlight moved into the right column, resized/reframed without the container box.

## v0.6 (2026-07-21)

CSV import/export on the Collection page with a prefilled template file and catalog-matching on import, plus a Dashboard "Top card in your collection" highlight section with a larger thumbnail.

## v0.5 (2026-07-21)

Variant/subtype price tracking fix, full card detail panel (Collection + Dashboard), Discord/GitHub/email sign-in, brand-gradient Add to Collection button.

## v0.4 (2026-07-21)

Dashboard Recently Added widget with sort, richer set completion bars, dashboard duplicate-widget bug fix, Collection page restructured into collapsible Game>Set hierarchy with lightbox gallery, in-place quantity editing, price+trend arrows, Enter-to-search, restricted card number search, GitHub Actions nightly price automation.

## v0.3 (2026-07-21)

Fixed sign-in collision bug, fixed duplicate dropdown bug, added card images, full brand redesign, SEO title updates.

## v0.2 (2026-07-21)

Added Collection page (browse/search/add cards, Master set checkbox), nav links between pages.

## v0.1 (2026-07-21)

First working version: dashboard, schema, Google auth, full Pokemon/MTG/Lorcana catalog import.
