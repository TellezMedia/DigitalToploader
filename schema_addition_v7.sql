-- Run this in Supabase SQL Editor
-- Stores daily exchange rates (base: USD) for display-only currency conversion.
-- Populated automatically by scripts/import.js on each run.

create table if not exists exchange_rates (
  currency_code text primary key,
  rate numeric not null,
  updated_at timestamptz not null default now()
);

-- Public read access, no auth required (rates aren't sensitive, needed pre-login too)
alter table exchange_rates enable row level security;
create policy "Anyone can read exchange rates" on exchange_rates
  for select using (true);

-- Seed with USD so the site has a baseline row before the first import runs
insert into exchange_rates (currency_code, rate) values ('USD', 1) on conflict do nothing;
