const SPOTIFY_BASE = "https://api.spotify.com/v1";

async function spotifyFetch(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

export async function searchSpotify(
  query: string,
  type: string,
  accessToken: string,
  limit = 20
) {
  const params = new URLSearchParams({ q: query, type, limit: String(limit) });
  return spotifyFetch(`${SPOTIFY_BASE}/search?${params}`, accessToken);
}

export async function getRecommendations(
  seedTracks: string[],
  seedArtists: string[],
  accessToken: string,
  limit = 20
) {
  const params = new URLSearchParams({
    seed_tracks: seedTracks.slice(0, 3).join(","),
    seed_artists: seedArtists.slice(0, 2).join(","),
    limit: String(limit),
  });
  return spotifyFetch(`${SPOTIFY_BASE}/recommendations?${params}`, accessToken);
}

export async function getUserTopTracks(accessToken: string, limit = 10) {
  return spotifyFetch(
    `${SPOTIFY_BASE}/me/top/tracks?limit=${limit}&time_range=short_term`,
    accessToken
  );
}

export async function getUserTopArtists(accessToken: string, limit = 5) {
  return spotifyFetch(
    `${SPOTIFY_BASE}/me/top/artists?limit=${limit}&time_range=short_term`,
    accessToken
  );
}

export async function getUserPlaylists(accessToken: string) {
  return spotifyFetch(`${SPOTIFY_BASE}/me/playlists?limit=50`, accessToken);
}

export async function createPlaylist(
  userId: string,
  name: string,
  description: string,
  accessToken: string
) {
  const res = await fetch(`${SPOTIFY_BASE}/users/${userId}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description, public: false }),
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

export async function updatePlaylist(
  playlistId: string,
  name: string,
  description: string,
  accessToken: string
) {
  const res = await fetch(`${SPOTIFY_BASE}/playlists/${playlistId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
}

export async function addTracksToPlaylist(
  playlistId: string,
  uris: string[],
  accessToken: string
) {
  const res = await fetch(`${SPOTIFY_BASE}/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris }),
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

export async function getPlaylistTracks(playlistId: string, accessToken: string) {
  return spotifyFetch(
    `${SPOTIFY_BASE}/playlists/${playlistId}/tracks?limit=50`,
    accessToken
  );
}

export async function getArtist(artistId: string, accessToken: string) {
  return spotifyFetch(`${SPOTIFY_BASE}/artists/${artistId}`, accessToken);
}

export async function getArtistTopTracks(artistId: string, accessToken: string) {
  return spotifyFetch(
    `${SPOTIFY_BASE}/artists/${artistId}/top-tracks?market=US`,
    accessToken
  );
}
