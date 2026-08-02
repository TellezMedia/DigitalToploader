# Release Notes

## v0.17 (2026-07-26)

**Added:**
- Set Completion widgets now grouped by game (Pokemon, Magic, Lorcana, etc. each as their own section) instead of one mixed list. Drag-to-reorder still works, scoped within each game's own section.
- Master Set Checklist: click any Set Completion widget to open a full visual checklist, every card+variant in that set as a thumbnail, sorted by card number. Owned cards show in full color, unowned ones are grayscale and clickable to quick-add (turns color immediately). Web only.
- 4 new TCGs added to the catalog: One Piece Card Game, Digimon Card Game, Star Wars: Unlimited, Flesh and Blood. (Lord of the Rings TCG dropped, not actually a tracked TCGCSV category. Palworld checked again post-launch, still not listed either.)

**Fixed (import script):**
- Both fetch helper functions now time out after 20 seconds instead of hanging silently forever on an unresponsive request.

**Setup required:**
- No schema changes for the app itself
- The import script needs a full re-run to pull in the 4 new games' catalogs (a long run, similar to the original import)

## v0.16 (2026-07-26)

Bumped topbar logo height from 28px to 48px.

## v0.15 (2026-07-26)

Embedded real logo, favicon, and app icon assets across all three pages.
