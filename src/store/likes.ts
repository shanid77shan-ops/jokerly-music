import { create } from "zustand";

export interface LikedSong {
  id: string;
  track_uri: string;
  track_name: string;
  track_image?: string | null;
  track_artist?: string | null;
  liked_at: string;
}

export interface LikedArtist {
  id: string;
  artist_id: string;
  artist_name: string;
  artist_image?: string | null;
  liked_at: string;
}

interface LikesState {
  songs: LikedSong[];
  artists: LikedArtist[];
  songUris: Set<string>;
  artistIds: Set<string>;
  loaded: boolean;

  load: () => Promise<void>;
  toggleSong: (track: { uri: string; name: string; image?: string | null; artist?: string | null }) => Promise<void>;
  toggleArtist: (artist: { id: string; name: string; image?: string | null }) => Promise<void>;
}

export const useLikesStore = create<LikesState>((set, get) => ({
  songs: [],
  artists: [],
  songUris: new Set(),
  artistIds: new Set(),
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const [songsRes, artistsRes] = await Promise.allSettled([
      fetch("/api/likes/songs").then((r) => r.json()),
      fetch("/api/likes/artists").then((r) => r.json()),
    ]);
    const songs: LikedSong[] = songsRes.status === "fulfilled" && Array.isArray(songsRes.value) ? songsRes.value : [];
    const artists: LikedArtist[] = artistsRes.status === "fulfilled" && Array.isArray(artistsRes.value) ? artistsRes.value : [];
    set({
      songs,
      artists,
      songUris: new Set(songs.map((s) => s.track_uri)),
      artistIds: new Set(artists.map((a) => a.artist_id)),
      loaded: true,
    });
  },

  toggleSong: async (track) => {
    const { songUris, songs } = get();
    const isLiked = songUris.has(track.uri);

    if (isLiked) {
      // Optimistic remove
      set({
        songs: songs.filter((s) => s.track_uri !== track.uri),
        songUris: new Set([...songUris].filter((u) => u !== track.uri)),
      });
      await fetch("/api/likes/songs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_uri: track.uri }),
      }).catch(() => {
        // Rollback on failure
        set({ songs, songUris });
      });
    } else {
      const newEntry: LikedSong = {
        id: crypto.randomUUID(),
        track_uri: track.uri,
        track_name: track.name,
        track_image: track.image ?? null,
        track_artist: track.artist ?? null,
        liked_at: new Date().toISOString(),
      };
      // Optimistic add
      set({
        songs: [newEntry, ...songs],
        songUris: new Set([...songUris, track.uri]),
      });
      const res = await fetch("/api/likes/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track_uri: track.uri,
          track_name: track.name,
          track_image: track.image ?? null,
          track_artist: track.artist ?? null,
        }),
      }).catch(() => null);
      if (!res?.ok) {
        // Rollback
        set({ songs, songUris });
      }
    }
  },

  toggleArtist: async (artist) => {
    const { artistIds, artists } = get();
    const isLiked = artistIds.has(artist.id);

    if (isLiked) {
      set({
        artists: artists.filter((a) => a.artist_id !== artist.id),
        artistIds: new Set([...artistIds].filter((id) => id !== artist.id)),
      });
      await fetch("/api/likes/artists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artist.id }),
      }).catch(() => {
        set({ artists, artistIds });
      });
    } else {
      const newEntry: LikedArtist = {
        id: crypto.randomUUID(),
        artist_id: artist.id,
        artist_name: artist.name,
        artist_image: artist.image ?? null,
        liked_at: new Date().toISOString(),
      };
      set({
        artists: [newEntry, ...artists],
        artistIds: new Set([...artistIds, artist.id]),
      });
      const res = await fetch("/api/likes/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_id: artist.id,
          artist_name: artist.name,
          artist_image: artist.image ?? null,
        }),
      }).catch(() => null);
      if (!res?.ok) {
        set({ artists, artistIds });
      }
    }
  },
}));
