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
| `schema_addition_v6.sql` | Applied | Adds `language` column to `user_collection` (v0.20) |
| `schema_addition_v7.sql` | Applied | Adds `exchange_rates` table for currency conversion (v0.20) |
| `schema_addition_v8.sql` | **Pending** | Social layer: adds `username`/`is_public` to `user_profiles`, adds `follows` table (v0.50) |
| `schema_addition_v9.sql` | **Pending** | Adds `import_batches`/`import_batch_items` for "Undo last import" (v0.20) |
| `schema_addition_v10.sql` | **Pending** | Adds `binder_page`/`binder_slot` to `user_collection`, `source` to `product_purchases` (v0.21) |
| `schema_addition_v11.sql` | **Pending** | Adds `custom_master_sets` table and `distinct_card_types`/`distinct_card_rarities` views (v0.22) |

When the next release adds a schema change, add a new `schema_addition_vN.sql`
and a new row here rather than editing an already-applied file. Note which
track it belongs to (v0.2x app or v0.5x social) in the description.
