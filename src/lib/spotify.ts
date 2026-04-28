const SPOTIFY_BASE = "https://api.spotify.com/v1";

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "SpotifyError";
  }
}

async function spotifyFetch(url: string, accessToken: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SpotifyError(res.status, `Spotify API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function searchSpotify(query: string, type: string, accessToken: string, limit = 20) {
  const t = type === "all" ? "track,artist,album" : type;
  const params = new URLSearchParams({ q: query, type: t, limit: String(limit) });
  return spotifyFetch(`${SPOTIFY_BASE}/search?${params}`, accessToken);
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
  return spotifyFetch(`${SPOTIFY_BASE}/artists/${artistId}/top-tracks?market=US`, accessToken);
}

export async function getRelatedArtists(artistId: string, accessToken: string) {
  return spotifyFetch(`${SPOTIFY_BASE}/artists/${artistId}/related-artists`, accessToken);
}
