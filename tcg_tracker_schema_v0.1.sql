-- TCG Collection Tracker - Initial Schema v0.1
-- Run this in Supabase SQL Editor (Project > SQL Editor > New Query)

-- ============================================
-- CATALOG TABLES (shared across all users)
-- ============================================

create table games (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,          -- 'Pokemon', 'Magic: The Gathering', 'Lorcana'
  slug text not null unique,          -- 'pokemon', 'mtg', 'lorcana'
  created_at timestamptz default now()
);

create table sets (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  name text not null,                 -- 'Perfect Order'
  set_code text,                      -- short code if the game uses one
  total_cards integer not null,       -- needed to calculate completion %
  release_date date,
  created_at timestamptz default now()
);

create table cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references sets(id) on delete cascade,
  name text not null,
  card_number text,                   -- '001/088'
  rarity text,
  card_type text,                     -- energy type, card supertype, etc
  image_url text,
  tcgcsv_product_id text,             -- for matching against TCGCSV pricing data
  created_at timestamptz default now()
);

-- ============================================
-- PRICING (updated on a schedule from TCGCSV / game-specific APIs)
-- ============================================

create table price_history (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references cards(id) on delete cascade,
  market_price numeric(10,2),
  low_price numeric(10,2),
  recorded_at timestamptz default now()
);

create index idx_price_history_card_date on price_history(card_id, recorded_at desc);

-- ============================================
-- USER DATA (private per user, protected by RLS below)
-- ============================================

create table user_collection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  card_id uuid references cards(id) on delete cascade not null,
  quantity integer not null default 1,
  condition text default 'Near Mint',
  variant text,                       -- 'Holo', 'Reverse Holo', 'Foil', etc
  language text default 'English',
  added_at timestamptz default now(),
  unique(user_id, card_id, condition, variant, language)
);

create table user_master_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  set_id uuid references sets(id) on delete cascade not null,
  flagged_at timestamptz default now(),
  unique(user_id, set_id)
);

create table user_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  card_id uuid references cards(id) on delete cascade not null,
  added_at timestamptz default now(),
  unique(user_id, card_id)
);

create table user_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  card_id uuid references cards(id) on delete cascade not null,
  target_price numeric(10,2),
  added_at timestamptz default now(),
  unique(user_id, card_id)
);

-- ============================================
-- ROW LEVEL SECURITY
-- Each user can only see and modify their own rows.
-- Catalog tables (games, sets, cards, price_history) stay public read-only.
-- ============================================

alter table user_collection enable row level security;
alter table user_master_sets enable row level security;
alter table user_wishlist enable row level security;
alter table user_watchlist enable row level security;

create policy "Users manage their own collection"
  on user_collection for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own master sets"
  on user_master_sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own wishlist"
  on user_wishlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own watchlist"
  on user_watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Catalog tables: public read access, no write access from the client
alter table games enable row level security;
alter table sets enable row level security;
alter table cards enable row level security;
alter table price_history enable row level security;

create policy "Anyone can read games" on games for select using (true);
create policy "Anyone can read sets" on sets for select using (true);
create policy "Anyone can read cards" on cards for select using (true);
create policy "Anyone can read price history" on price_history for select using (true);
