create table if not exists pinned_artists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  artist_id text not null,
  artist_name text not null,
  artist_image text default '',
  pinned_at timestamptz default now(),
  unique(user_id, artist_id)
);

alter table pinned_artists enable row level security;

create policy "Users can manage their own pinned artists"
  on pinned_artists
  for all
  using (user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  with check (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
