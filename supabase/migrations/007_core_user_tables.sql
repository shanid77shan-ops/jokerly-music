-- Core user tables used by API routes (auth via NextAuth Spotify id, not Supabase Auth JWT)

create table if not exists user_language_prefs (
  user_id text primary key,
  languages text[] default '{}',
  favorite_artists jsonb default '[]',
  updated_at timestamptz default now()
);

create table if not exists liked_songs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  track_uri text not null,
  track_name text not null,
  track_image text,
  track_artist text,
  liked_at timestamptz default now(),
  unique(user_id, track_uri)
);

create index if not exists liked_songs_user_idx on liked_songs(user_id, liked_at desc);

create table if not exists liked_artists (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  artist_id text not null,
  artist_name text not null,
  artist_image text,
  liked_at timestamptz default now(),
  unique(user_id, artist_id)
);

create index if not exists liked_artists_user_idx on liked_artists(user_id, liked_at desc);

create table if not exists recently_played (
  id bigserial primary key,
  user_id text not null,
  track_uri text not null,
  track_name text not null,
  track_artist text not null,
  track_image text,
  played_at timestamptz default now(),
  unique(user_id, track_uri)
);

create index if not exists recently_played_user_idx on recently_played(user_id, played_at desc);

create or replace function trim_recently_played(p_user_id text)
returns void
language plpgsql
as $$
begin
  delete from recently_played
  where user_id = p_user_id
    and id not in (
      select id from recently_played
      where user_id = p_user_id
      order by played_at desc
      limit 20
    );
end;
$$;
