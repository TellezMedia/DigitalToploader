-- Run this in Supabase SQL Editor
-- Social layer (v0.5x track): shareable links for collection stats, a
-- master set's completion, or a single card. The link itself carries a
-- random unguessable token, not the raw user/set/card id, so knowing or
-- incrementing an id can't expose someone else's private data. The
-- get_public_share() function is SECURITY DEFINER so it can read the
-- narrow, specific data a valid token points to without opening up
-- broader public read access to user_collection or user_profiles.

create table if not exists shares (
  id uuid primary key default gen_random_uuid(),
  share_token uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_type text not null check (share_type in ('stats', 'master_set', 'card')),
  set_id uuid references sets(id) on delete cascade,
  card_id uuid references cards(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table shares enable row level security;

create policy "Users manage their own shares"
  on shares for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function get_public_share(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  share_row shares%rowtype;
  result json;
begin
  select * into share_row from shares where share_token = p_token;
  if not found then
    return json_build_object('error', 'not_found');
  end if;

  if share_row.share_type = 'stats' then
    select json_build_object(
      'type', 'stats',
      'display_name', coalesce(up.display_name, 'A collector'),
      'avatar_url', up.avatar_url,
      'total_cards', (select coalesce(sum(quantity), 0) from user_collection where user_id = share_row.user_id),
      'unique_cards', (select count(distinct card_id) from user_collection where user_id = share_row.user_id),
      'portfolio_value', (
        select coalesce(sum(coalesce(lp.market_price, 0) * uc.quantity), 0)
        from user_collection uc
        left join latest_prices lp on lp.card_id = uc.card_id and lp.variant = coalesce(uc.variant, 'Normal')
        where uc.user_id = share_row.user_id
      )
    ) into result
    from user_profiles up
    where up.user_id = share_row.user_id;

    if result is null then
      select json_build_object(
        'type', 'stats',
        'display_name', 'A collector',
        'avatar_url', null,
        'total_cards', (select coalesce(sum(quantity), 0) from user_collection where user_id = share_row.user_id),
        'unique_cards', (select count(distinct card_id) from user_collection where user_id = share_row.user_id),
        'portfolio_value', (
          select coalesce(sum(coalesce(lp.market_price, 0) * uc.quantity), 0)
          from user_collection uc
          left join latest_prices lp on lp.card_id = uc.card_id and lp.variant = coalesce(uc.variant, 'Normal')
          where uc.user_id = share_row.user_id
        )
      ) into result;
    end if;

  elsif share_row.share_type = 'master_set' then
    select json_build_object(
      'type', 'master_set',
      'set_name', s.name,
      'game_name', g.name,
      'total_cards', s.total_cards,
      'owned_count', (
        select count(distinct uc.card_id)
        from user_collection uc
        join cards c2 on c2.id = uc.card_id
        where c2.set_id = s.id and uc.user_id = share_row.user_id
      )
    ) into result
    from sets s
    join games g on g.id = s.game_id
    where s.id = share_row.set_id;

  elsif share_row.share_type = 'card' then
    select json_build_object(
      'type', 'card',
      'card_name', c.name,
      'card_number', c.card_number,
      'image_url', c.image_url,
      'rarity', c.rarity,
      'set_name', s.name,
      'game_name', g.name,
      'market_price', lp.market_price
    ) into result
    from cards c
    join sets s on s.id = c.set_id
    join games g on g.id = s.game_id
    left join latest_prices lp on lp.card_id = c.id
    where c.id = share_row.card_id
    limit 1;
  end if;

  return coalesce(result, json_build_object('error', 'no_data'));
end;
$$;

grant execute on function get_public_share(uuid) to anon, authenticated;
