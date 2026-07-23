# Release Notes

## v0.8 (2026-07-22)

**Fixed (revised from v0.8):** v0.8's centering fix for the Recently Added grid didn't fit the site's left-heavy layout. Replaced it with a better approach: the grid now picks a column count that divides evenly into however many cards are being shown, so it always fills complete rows, extending to a 3rd, 4th, or 5th row as needed, rather than leaving a partial row (centered or otherwise). Recalculates on window resize, so it stays correct across screen sizes. Grid stays left-aligned, consistent with the rest of the layout.


Attempted fix centered an incomplete last row instead of leaving it flush-left with a gap.

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
