const SPOTIFY_BASE = "https://api.spotify.com/v1";

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "SpotifyError";
  }
}

async function spotifyFetch(url: string, accessToken: string, timeoutMs = 8000): Promise<any> {
  console.log("[spotifyFetch] url:", url, "token:", accessToken?.slice(0, 15), "tokenLen:", accessToken?.length);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new SpotifyError(res.status, `Spotify API ${res.status}: ${body}`);
    }
    return res.json();
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") throw new SpotifyError(504, "Spotify request timed out");
    throw e;
  }
}

function buildSearchUrl(query: string, type: string, limit: number, offset = 0) {
  // Use encodeURIComponent (%20) — Spotify rejects URLSearchParams + encoding
  const safeLimit = Math.floor(Math.max(1, Math.min(limit, 10)));
  let url = `${SPOTIFY_BASE}/search?q=${encodeURIComponent(query)}&type=${type}&limit=${safeLimit}`;
  if (offset > 0) url += `&offset=${Math.min(Math.floor(offset), 100)}`;
  return url;
}

export async function searchSpotify(query: string, type: string, accessToken: string, limit = 20, offset = 0) {
  // 5s per-call timeout — tight enough to fit 3 parallel calls + cold-start within a 10s function budget
  const T = 5000;

  if (type !== "all") {
    return spotifyFetch(buildSearchUrl(query, type, limit, offset), accessToken, T);
  }

  // Three parallel requests — allSettled so one failure doesn't crash the rest
  const [tracksResult, artistsResult, albumsResult] = await Promise.allSettled([
    spotifyFetch(buildSearchUrl(query, "track", limit, offset), accessToken, T),
    spotifyFetch(buildSearchUrl(query, "artist", limit, offset), accessToken, T),
    spotifyFetch(buildSearchUrl(query, "album", limit, offset), accessToken, T),
  ]);

  // Only throw if ALL three failed
  if (tracksResult.status === "rejected" && artistsResult.status === "rejected" && albumsResult.status === "rejected") {
    throw tracksResult.reason;
  }

  return {
    tracks: tracksResult.status === "fulfilled" ? tracksResult.value.tracks : { items: [] },
    artists: artistsResult.status === "fulfilled" ? artistsResult.value.artists : { items: [] },
    albums: albumsResult.status === "fulfilled" ? albumsResult.value.albums : { items: [] },
  };
}

export async function getRecommendations(
  seedTracks: string[],
  seedArtists: string[],
  accessToken: string,
  limit = 20
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (seedTracks.length) params.set("seed_tracks", seedTracks.slice(0, 3).join(","));
  if (seedArtists.length) params.set("seed_artists", seedArtists.slice(0, 2).join(","));
  return spotifyFetch(`${SPOTIFY_BASE}/recommendations?${params}`, accessToken);
}

export async function getRecommendationsByGenre(genre: string, accessToken: string, limit = 20) {
  const params = new URLSearchParams({ seed_genres: genre, limit: String(limit) });
  return spotifyFetch(`${SPOTIFY_BASE}/recommendations?${params}`, accessToken);
}

export async function getRecommendationsByTrack(trackId: string, accessToken: string, limit = 20) {
  const params = new URLSearchParams({ seed_tracks: trackId, limit: String(limit) });
  return spotifyFetch(`${SPOTIFY_BASE}/recommendations?${params}`, accessToken);
}

export async function getUserTopTracks(accessToken: string, limit = 20) {
  return spotifyFetch(`${SPOTIFY_BASE}/me/top/tracks?limit=${limit}&time_range=short_term`, accessToken);
}

export async function getUserTopArtists(accessToken: string, limit = 10) {
  return spotifyFetch(`${SPOTIFY_BASE}/me/top/artists?limit=${limit}&time_range=short_term`, accessToken);
}

export async function getUserPlaylists(accessToken: string) {
  return spotifyFetch(`${SPOTIFY_BASE}/me/playlists?limit=50`, accessToken);
}

export async function getArtist(artistId: string, accessToken: string) {
  return spotifyFetch(`${SPOTIFY_BASE}/artists/${artistId}`, accessToken);
}

export async function getArtistTopTracks(artistId: string, accessToken: string) {
  return spotifyFetch(`${SPOTIFY_BASE}/artists/${artistId}/top-tracks?market=IN`, accessToken, 5000);
}

export async function getRelatedArtists(artistId: string, accessToken: string) {
  return spotifyFetch(`${SPOTIFY_BASE}/artists/${artistId}/related-artists`, accessToken, 5000);
}

export async function getTracksByIds(ids: string[], accessToken: string) {
  const safeIds = ids.slice(0, 50).join(",");
  return spotifyFetch(`${SPOTIFY_BASE}/tracks?ids=${safeIds}`, accessToken);
}
