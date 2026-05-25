import {
  getArtistTopTracks,
  getRelatedArtists,
  searchSpotify,
  SpotifyError,
} from "@/lib/spotify";
import { spotifyTrackIdFromUri } from "@/lib/spotify-track-id";

const SPOTIFY_BASE = "https://api.spotify.com/v1";

type SpotifyTrackItem = {
  id: string;
  uri: string;
  name: string;
  artists?: { id?: string; name: string }[];
  album?: { images?: { url: string }[] };
  duration_ms?: number;
};

async function spotifyGet(url: string, accessToken: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function dedupeTracks(
  tracks: SpotifyTrackItem[],
  excludeUri?: string | null,
  excludeId?: string | null
): SpotifyTrackItem[] {
  const seen = new Set<string>();
  const result: SpotifyTrackItem[] = [];

  for (const track of tracks) {
    if (!track?.id || !track?.uri) continue;
    if (excludeUri && track.uri === excludeUri) continue;
    if (excludeId && track.id === excludeId) continue;
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    result.push(track);
  }

  return result;
}

async function resolveTrackId(
  trackId: string | null,
  trackUri: string | null,
  trackName: string,
  artistName: string,
  accessToken: string
): Promise<{ trackId: string | null; artistId: string | null }> {
  if (trackId) return { trackId, artistId: null };

  const fromUri = spotifyTrackIdFromUri(trackUri);
  if (fromUri) return { trackId: fromUri, artistId: null };

  const primaryArtist = artistName.split(",")[0].trim();
  const queries = [
    `track:"${trackName}" artist:"${primaryArtist}"`,
    `track:${trackName} artist:${primaryArtist}`,
    `${trackName} ${primaryArtist}`,
  ];

  for (const query of queries) {
    const data = (await searchSpotify(query, "track", accessToken, 5)) as {
      tracks?: { items?: SpotifyTrackItem[] };
    };
    const items = data?.tracks?.items ?? [];
    const exact =
      items.find(
        (item) =>
          item.name.toLowerCase() === trackName.toLowerCase() &&
          item.artists?.some((artist) =>
            artist.name.toLowerCase().includes(primaryArtist.toLowerCase())
          )
      ) ?? items[0];

    if (exact?.id) {
      return {
        trackId: exact.id,
        artistId: exact.artists?.[0]?.id ?? null,
      };
    }
  }

  return { trackId: null, artistId: null };
}

async function resolveArtistId(
  artistName: string,
  hintArtistId: string | null,
  accessToken: string
): Promise<string | null> {
  if (hintArtistId) return hintArtistId;

  const primaryArtist = artistName.split(",")[0].trim();
  const data = (await searchSpotify(`artist:${primaryArtist}`, "artist", accessToken, 5)) as {
    artists?: { items?: { id: string; name: string }[] };
  };
  const items = data?.artists?.items ?? [];
  const match =
    items.find((item) => item.name.toLowerCase() === primaryArtist.toLowerCase()) ?? items[0];
  return match?.id ?? null;
}

async function fetchFromRecommendations(
  trackId: string,
  accessToken: string,
  limit: number
): Promise<SpotifyTrackItem[]> {
  const urls = [
    `${SPOTIFY_BASE}/recommendations?seed_tracks=${trackId}&limit=${limit}&market=from_token`,
    `${SPOTIFY_BASE}/recommendations?seed_tracks=${trackId}&limit=${limit}`,
  ];

  for (const url of urls) {
    const data = (await spotifyGet(url, accessToken)) as { tracks?: SpotifyTrackItem[] } | null;
    if (data?.tracks?.length) return data.tracks;
  }

  return [];
}

async function fetchFromArtistFallback(
  artistId: string,
  accessToken: string,
  limit: number
): Promise<SpotifyTrackItem[]> {
  const collected: SpotifyTrackItem[] = [];

  try {
    const top = await getArtistTopTracks(artistId, accessToken);
    collected.push(...((top as { tracks?: SpotifyTrackItem[] }).tracks ?? []));
  } catch {
    const top = (await spotifyGet(
      `${SPOTIFY_BASE}/artists/${artistId}/top-tracks`,
      accessToken
    )) as { tracks?: SpotifyTrackItem[] } | null;
    collected.push(...(top?.tracks ?? []));
  }

  const related = await getRelatedArtists(artistId, accessToken).catch(() => null);
  for (const relatedArtist of (related as { artists?: { id: string }[] } | null)?.artists?.slice(0, 3) ?? []) {
    const top = (await spotifyGet(
      `${SPOTIFY_BASE}/artists/${relatedArtist.id}/top-tracks?limit=5&market=from_token`,
      accessToken
    )) as { tracks?: SpotifyTrackItem[] } | null;
    collected.push(...(top?.tracks?.slice(0, 3) ?? []));
  }

  return collected.slice(0, limit * 2);
}

async function fetchFromSearchFallback(
  trackName: string,
  artistName: string,
  accessToken: string,
  limit: number
): Promise<SpotifyTrackItem[]> {
  const primaryArtist = artistName.split(",")[0].trim();
  const queries = [`artist:"${primaryArtist}"`, `artist:${primaryArtist}`, `${trackName} ${primaryArtist}`];
  const collected: SpotifyTrackItem[] = [];

  for (const query of queries) {
    try {
      const data = (await searchSpotify(query, "track", accessToken, limit)) as {
        tracks?: { items?: SpotifyTrackItem[] };
      };
      collected.push(...(data?.tracks?.items ?? []));
      if (collected.length >= limit) break;
    } catch {
      // try next query
    }
  }

  return collected;
}

export async function fetchSimilarTracks(
  accessToken: string,
  options: {
    trackId?: string | null;
    trackUri?: string | null;
    trackName: string;
    artistName: string;
    limit?: number;
  }
): Promise<SpotifyTrackItem[]> {
  const limit = options.limit ?? 15;
  const excludeUri = options.trackUri ?? null;

  const { trackId: resolvedTrackId, artistId: hintArtistId } = await resolveTrackId(
    options.trackId ?? null,
    options.trackUri ?? null,
    options.trackName,
    options.artistName,
    accessToken
  );

  let tracks: SpotifyTrackItem[] = [];

  if (resolvedTrackId) {
    try {
      tracks = await fetchFromRecommendations(resolvedTrackId, accessToken, limit);
    } catch (error) {
      if (!(error instanceof SpotifyError)) throw error;
    }
  }

  if (tracks.length < limit) {
    const artistId = await resolveArtistId(options.artistName, hintArtistId, accessToken);
    if (artistId) {
      const artistTracks = await fetchFromArtistFallback(artistId, accessToken, limit);
      tracks = [...tracks, ...artistTracks];
    }
  }

  if (tracks.length < limit) {
    const searchTracks = await fetchFromSearchFallback(
      options.trackName,
      options.artistName,
      accessToken,
      limit
    );
    tracks = [...tracks, ...searchTracks];
  }

  return dedupeTracks(tracks, excludeUri, resolvedTrackId).slice(0, limit);
}
