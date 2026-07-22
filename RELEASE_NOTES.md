# Release Notes

## v0.6 (2026-07-21)

**CSV import/export (Collection page):**
- **Export**: "Export CSV" link pulls your entire collection into a downloadable CSV (Game, Set, Card Name, Card Number, Variant, Quantity, Condition).
- **Import**: "Import CSV" opens a file picker, parses the file (using PapaParse), and matches each row to the catalog by Game + Set + Card Name + Card Number. Matched rows get added/updated in your collection; unmatched rows are listed in a summary panel so you can fix and re-import just those.
- **Template**: "Template" link downloads a prefilled example CSV (`collection-import-template.csv`) showing the expected column format.
- New file to upload: `collection-import-template.csv` (repo root, same folder as `index.html`).

**Dashboard highlight:**
- New "Top card in your collection" section above the stats/Recently Added layout, shows your single highest-value owned card with a larger thumbnail, name, set, and price. Click it to open the full card detail panel. Reuses the same collection data already being fetched for the portfolio value calculation, no extra query needed.

**Process note:** both files were run through a Node.js syntax check before delivery this round, to catch the kind of JS errors (like the earlier naming collision) before they reach the live site instead of after.

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
