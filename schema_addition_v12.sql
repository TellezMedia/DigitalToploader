-- Run this in Supabase SQL Editor
-- Palworld-specific card detail fields for the hover/tap info popup.
-- Nullable, other games simply won't populate these and the popup won't show.

alter table cards add column if not exists subtype text;
alter table cards add column if not exists effect_text text;
alter table cards add column if not exists work_keywords text; -- comma-separated, e.g. "Harvesting,Crafting,Transporting"
