-- Run this in Supabase SQL Editor
-- Adds a view comparing each card's latest price snapshot to the one before it,
-- used to show the up/down trend arrow on the Collection page.
-- Note: previous_price will be null for every card until at least two
-- price_history snapshots exist for it (i.e. until the import has run at least
-- twice), so no trend arrow will show until then. That's expected.

create view price_trends as
with ranked as (
  select
    card_id,
    market_price,
    recorded_at,
    row_number() over (partition by card_id order by recorded_at desc) as rn,
    lag(market_price) over (partition by card_id order by recorded_at asc) as prev_price
  from price_history
)
select
  card_id,
  market_price as latest_price,
  prev_price as previous_price
from ranked
where rn = 1;
