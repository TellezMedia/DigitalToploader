# Release Notes

## v0.14 (2026-07-25)

**Fixed:**
- Binders page was showing every binder twice. Root cause: `binders.html` was missing a guard against Supabase's `onAuthStateChange` firing more than once on page load, the same bug class already fixed in `index.html`/`collection.html` back in v0.3, just missed when `binders.html` was built fresh in v0.12. This should be a display-only fix, not a data issue, but worth a quick check in Supabase's `binders` table after upload to confirm there aren't any real duplicate rows left over from before this fix (delete any exact duplicates by name/color/brand if found).

## v0.13 (2026-07-25)

Fixed detail modal image compression, replaced per-card Purchase Price with a sealed-product purchase log, first mobile responsiveness pass.

## v0.12 (2026-07-25)

Added the Binders page.

## v0.11 (2026-07-25)

Purchase price field + spend-vs-value chart.

## v0.10 (2026-07-24)

Estimated Grade + Trade Available fields.
