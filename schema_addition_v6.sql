-- Run this in Supabase SQL Editor
-- Adds language variant tracking (English/Japanese/etc) to user_collection.
-- Existing rows default to 'English'.

alter table user_collection add column if not exists language text not null default 'English';
