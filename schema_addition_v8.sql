-- Run this in Supabase SQL Editor
-- Social layer v0.50: profiles + follow-request system.
-- (Social features are versioned separately as v0.5x; this schema change
-- belongs to that track even though the file numbering here is sequential
-- with the rest of the app's migrations. See SCHEMA_INDEX.md.)

-- Username handle (e.g. "JDoeTCG") and public/private profile toggle.
alter table user_profiles add column if not exists username text;
alter table user_profiles add column if not exists is_public boolean not null default true;

create unique index if not exists user_profiles_username_unique
  on user_profiles (lower(username))
  where username is not null;

-- Follow requests / relationships. A row with status 'accepted' means
-- follower_id follows followee_id. A row with status 'pending' means
-- follower_id has requested to follow followee_id and is awaiting approval.
create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint follows_no_self_follow check (follower_id <> followee_id),
  constraint follows_unique_pair unique (follower_id, followee_id)
);

alter table follows enable row level security;

-- Anyone signed in can see accepted follow rows (needed to compute public
-- follower/following counts and to check "am I already following this person").
create policy "Accepted follows are visible to any signed-in user"
  on follows for select
  using (status = 'accepted');

-- A pending request is only visible to the two people involved.
create policy "Pending follows visible to sender and recipient"
  on follows for select
  using (status = 'pending' and auth.uid() in (follower_id, followee_id));

-- Anyone can send a follow request as themselves.
create policy "Users can send their own follow requests"
  on follows for insert
  with check (auth.uid() = follower_id);

-- Only the recipient can approve/deny (update status), and either party can
-- remove the relationship (unfollow, or withdraw/deny a request).
create policy "Recipient can respond to a pending request"
  on follows for update
  using (auth.uid() = followee_id)
  with check (auth.uid() = followee_id);

create policy "Either party can delete a follow relationship"
  on follows for delete
  using (auth.uid() in (follower_id, followee_id));
