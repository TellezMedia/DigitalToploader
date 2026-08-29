-- ALREADY APPLIED to production Supabase — kept for historical reference only, do not re-run.
-- Run this in Supabase SQL Editor before running import.js
-- Adds the unique constraints the import script relies on for upserts

alter table sets add constraint sets_game_name_unique unique (game_id, name);
alter table cards add constraint cards_tcgcsv_product_id_unique unique (tcgcsv_product_id);
