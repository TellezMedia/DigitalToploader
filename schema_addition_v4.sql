-- Run this in Supabase SQL Editor
-- Adds a table to store the basic profile info shown on the Dashboard's
-- right-hand panel (display name, avatar, age, location, gender, favorite set).

create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  age integer,
  location text,
  gender text,
  favorite_set text,
  updated_at timestamptz default now()
);

alter table user_profiles enable row level security;

create policy "Users manage their own profile"
  on user_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
