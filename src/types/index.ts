export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  preview_url: string | null;
  explicit: boolean;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  external_urls: { spotify: string };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images?: { url: string; width: number; height: number }[];
  genres?: string[];
  followers?: { total: number };
  external_urls: { spotify: string };
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: { url: string; width: number; height: number }[];
  release_date: string;
  artists: SpotifyArtist[];
  external_urls: { spotify: string };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: { total: number };
  owner: { display_name: string };
  external_urls: { spotify: string };
}

export interface PinnedPlaylist {
  id: string;
  user_id: string;
  playlist_id: string;
  playlist_name: string;
  playlist_image: string;
  pinned_at: string;
}

export type SearchType = "track" | "artist" | "album" | "playlist";
