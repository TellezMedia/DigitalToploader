-- Run this in Supabase SQL Editor
-- Item Type (Raw/Sleeve/Slab) on collection rows, and individual-card
-- purchase batches (separate from sealed-product purchases) linked back
-- to the collection rows they created, for true cost-basis tracking.

alter table user_collection add column if not exists item_type text not null default 'Raw' check (item_type in ('Raw', 'Sleeve', 'Slab'));

-- One purchase "session": a shared date/source, containing one or more
-- individual card line items (a true batch, e.g. "bought 15 singles").
create table if not exists card_purchase_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text,
  total_price numeric not null default 0,
  purchased_at timestamptz not null default now()
);

alter table card_purchase_batches enable row level security;
create policy "Users manage their own card purchase batches"
  on card_purchase_batches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists card_purchase_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references card_purchase_batches(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  quantity integer not null default 1,
  price_paid numeric not null,
  item_type text not null default 'Raw' check (item_type in ('Raw', 'Sleeve', 'Slab')),
  estimated_grade numeric
);

alter table card_purchase_items enable row level security;
create policy "Users manage their own card purchase items"
  on card_purchase_items for all
  using (exists (select 1 from card_purchase_batches b where b.id = batch_id and b.user_id = auth.uid()))
  with check (exists (select 1 from card_purchase_batches b where b.id = batch_id and b.user_id = auth.uid()));

-- Links a collection row back to the exact purchase line item that
-- created it, so cost-per-card can be computed (price_paid / quantity).
alter table user_collection add column if not exists card_purchase_item_id uuid references card_purchase_items(id) on delete set null;
