-- Allow duplicate songs in the same playlist.
-- Previously blocked by playlist_id + track_uri unique constraint.
ALTER TABLE public.playlist_tracks
DROP CONSTRAINT IF EXISTS playlist_tracks_playlist_id_track_uri_key;
