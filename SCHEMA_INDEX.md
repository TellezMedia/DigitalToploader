# Schema migration history

Run these in order against a fresh database. On the existing production
database, everything through v5 is already applied, only run what's marked
pending below.

| File | Status | What it does |
|---|---|---|
| `tcg_tracker_schema_v0.1.sql` | Applied | Base schema: games, sets, cards, price_history, user_collection, profiles |
| `schema_addition.sql` | Applied | (see file for details) |
| `schema_addition_v2.sql` | Applied | (see file for details) |
| `schema_addition_v3.sql` | Applied | (see file for details) |
| `schema_addition_v4.sql` | Applied | (see file for details) |
| `schema_addition_v5.sql` | Applied | (see file for details) |
| `schema_addition_v6.sql` | **Pending** | Adds `language` column to `user_collection` (v0.20) |
| `schema_addition_v7.sql` | **Pending** | Adds `exchange_rates` table for currency conversion (v0.20) |

When the next release adds a schema change, add a new `schema_addition_vN.sql`
and a new row here rather than editing an already-applied file.
