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
  excludeId?: string | null,
  excludeIds: Set<string> = new Set()
): SpotifyTrackItem[] {
  const seen = new Set<string>();
  const result: SpotifyTrackItem[] = [];

  for (const track of tracks) {
    if (!track?.id || !track?.uri) continue;
    if (excludeUri && track.uri === excludeUri) continue;
    if (excludeId && track.id === excludeId) continue;
    if (excludeIds.has(track.id)) continue;
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
  poolSize: number,
  relatedOffset = 0
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
  const relatedArtists = (related as { artists?: { id: string }[] } | null)?.artists ?? [];
  const slice = relatedArtists.slice(relatedOffset, relatedOffset + 6);
  for (const relatedArtist of slice) {
    const top = (await spotifyGet(
      `${SPOTIFY_BASE}/artists/${relatedArtist.id}/top-tracks?limit=10&market=from_token`,
      accessToken
    )) as { tracks?: SpotifyTrackItem[] } | null;
    collected.push(...(top?.tracks ?? []));
  }

  return collected.slice(0, poolSize);
}

async function fetchFromSearchFallback(
  trackName: string,
  artistName: string,
  accessToken: string,
  poolSize: number,
  refreshSeed = 0
): Promise<SpotifyTrackItem[]> {
  const primaryArtist = artistName.split(",")[0].trim();
  const queries = [
    `artist:"${primaryArtist}"`,
    `artist:${primaryArtist}`,
    `${trackName} ${primaryArtist}`,
    `${primaryArtist}`,
    `genre:${primaryArtist} ${trackName}`,
    `${trackName}`,
  ];
  const collected: SpotifyTrackItem[] = [];
  const ordered = [...queries.slice(refreshSeed % queries.length), ...queries];

  for (const query of ordered) {
    try {
      const data = (await searchSpotify(query, "track", accessToken, 10)) as {
        tracks?: { items?: SpotifyTrackItem[] };
      };
      collected.push(...(data?.tracks?.items ?? []));
      if (collected.length >= poolSize) break;
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
    excludeIds?: string[];
    refreshSeed?: number;
  }
): Promise<SpotifyTrackItem[]> {
  const limit = options.limit ?? 5;
  const excluded = options.excludeIds ?? [];
  const poolSize = Math.max(limit * 8, 40, excluded.length * 4 + limit * 3);
  const excludeUri = options.trackUri ?? null;
  const excludeIds = new Set(excluded);
  const refreshSeed = options.refreshSeed ?? 0;
  const relatedOffset = refreshSeed * 2;

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
      tracks = await fetchFromRecommendations(resolvedTrackId, accessToken, poolSize);
    } catch (error) {
      if (!(error instanceof SpotifyError)) throw error;
    }
  }

  const artistId = await resolveArtistId(options.artistName, hintArtistId, accessToken);
  if (artistId) {
    const artistTracks = await fetchFromArtistFallback(
      artistId,
      accessToken,
      poolSize,
      relatedOffset
    );
    tracks = [...tracks, ...artistTracks];
  }

  const searchTracks = await fetchFromSearchFallback(
    options.trackName,
    options.artistName,
    accessToken,
    poolSize,
    refreshSeed
  );
  tracks = [...tracks, ...searchTracks];

  return dedupeTracks(tracks, excludeUri, resolvedTrackId, excludeIds).slice(0, limit);
}
