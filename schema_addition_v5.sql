-- Run this in Supabase SQL Editor
-- Adds a column to remember the user's custom drag-and-drop order for their
-- Set Completion widgets. Existing rows will have sort_order = null, which
-- is fine, they'll just sort last until dragged into a new position.

alter table user_master_sets add column sort_order integer;
