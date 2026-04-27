create table if not exists pinned_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  playlist_id text not null,
  playlist_name text not null,
  playlist_image text default '',
  pinned_at timestamptz default now(),
  unique(user_id, playlist_id)
);

alter table pinned_playlists enable row level security;

create policy "Users can manage their own pinned playlists"
  on pinned_playlists
  for all
  using (user_id = current_setting('request.jwt.claims', true)::json->>'sub')
  with check (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
