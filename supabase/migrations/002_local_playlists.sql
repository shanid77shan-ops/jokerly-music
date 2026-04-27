create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  description text default '',
  image text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  playlist_id uuid not null references playlists(id) on delete cascade,
  track_uri text not null,
  track_name text not null,
  added_at timestamptz default now(),
  unique(playlist_id, track_uri)
);

create index if not exists playlists_user_idx on playlists(user_id);
create index if not exists playlist_tracks_playlist_idx on playlist_tracks(playlist_id);
create index if not exists playlist_tracks_user_idx on playlist_tracks(user_id);
