-- Run this in Supabase SQL Editor
-- Adds variant (Normal / Reverse Holofoil / etc) tracking to price_history,
-- since a single card can have multiple separately-priced print variants.
-- Also adds mid_price and high_price so the pricing breakdown panel has a
-- full low/mid/high/market range to show, not just market+low.

alter table price_history add column variant text not null default 'Normal';
alter table price_history add column mid_price numeric(10,2);
alter table price_history add column high_price numeric(10,2);

drop view if exists latest_prices;
create view latest_prices as
select distinct on (card_id, variant)
  card_id, variant, market_price, low_price, mid_price, high_price, recorded_at
from price_history
order by card_id, variant, recorded_at desc;

drop view if exists price_trends;
create view price_trends as
with ranked as (
  select
    card_id,
    variant,
    market_price,
    recorded_at,
    row_number() over (partition by card_id, variant order by recorded_at desc) as rn,
    lag(market_price) over (partition by card_id, variant order by recorded_at asc) as prev_price
  from price_history
)
select
  card_id,
  variant,
  market_price as latest_price,
  prev_price as previous_price
from ranked
where rn = 1;
