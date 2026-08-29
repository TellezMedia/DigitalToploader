-- Run this in Supabase SQL Editor
-- Custom Master Sets: user-defined tracking goals (e.g. "every Pikachu",
-- "every Secret Rare in Obsidian Flames") backed by a live filter against
-- the existing card catalog, rather than a fixed printed set.

create table if not exists custom_master_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  game_id uuid not null references games(id) on delete cascade,
  filter_type text not null check (filter_type in ('name', 'card_type', 'rarity')),
  filter_value text not null,
  sort_order integer,
  created_at timestamptz not null default now()
);

alter table custom_master_sets enable row level security;
create policy "Users manage their own custom master sets"
  on custom_master_sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Powers the "Card Type" / "Rarity" dropdowns in the Custom Master Set
-- modal with real values per game, instead of a hand-maintained list.
create or replace view distinct_card_types as
  select distinct s.game_id, c.card_type
  from cards c
  join sets s on s.id = c.set_id
  where c.card_type is not null and c.card_type <> '';

create or replace view distinct_card_rarities as
  select distinct s.game_id, c.rarity
  from cards c
  join sets s on s.id = c.set_id
  where c.rarity is not null and c.rarity <> '';
