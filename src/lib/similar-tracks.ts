import { getArtistTopTracks, searchSpotify, SpotifyError } from "@/lib/spotify";
import { spotifyTrackIdFromUri } from "@/lib/spotify-track-id";

const SPOTIFY_BASE = "https://api.spotify.com/v1";
const MAX_SEARCH_CALLS_PER_REQUEST = 2;

export type SimilarTrack = {
  id: string;
  uri: string;
  name: string;
  artists: { id?: string; name: string }[];
  album?: { id?: string; name?: string; images?: { url: string }[] };
  duration_ms?: number;
  external_urls?: { spotify: string };
};

export type SimilarFetchResult = {
  tracks: SimilarTrack[];
  rateLimited: boolean;
};

type SeedContext = {
  trackId: string | null;
  trackUri: string | null;
  trackName: string;
  artistName: string;
  primaryArtistId: string | null;
  artistIds: string[];
  albumId: string | null;
  albumName: string | null;
  genres: string[];
};

type FetchState = {
  rateLimited: boolean;
  searchCalls: number;
};

async function spotifyGet(url: string, accessToken: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 429) return null;
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function compactTracks(items: unknown[]): SimilarTrack[] {
  const out: SimilarTrack[] = [];
  for (const raw of items) {
    const track = normalizeSimilarTrack(raw);
    if (track) out.push(track);
  }
  return out;
}

export function normalizeSimilarTrack(raw: unknown): SimilarTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const linked = item.linked_from as { id?: string } | undefined;
  const id = (typeof item.id === "string" ? item.id : null) ?? linked?.id ?? null;
  if (!id) return null;

  const uri =
    (typeof item.uri === "string" ? item.uri : null) ?? `spotify:track:${id}`;
  const name = typeof item.name === "string" ? item.name : null;
  if (!name) return null;

  const artists: { id?: string; name: string }[] = [];
  if (Array.isArray(item.artists)) {
    for (const a of item.artists) {
      const artist = a as { id?: string; name?: string };
      if (artist?.name) artists.push({ id: artist.id, name: artist.name });
    }
  }

  const albumRaw = item.album as Record<string, unknown> | undefined;

  return {
    id,
    uri,
    name,
    artists: artists.length > 0 ? artists : [{ name: "Unknown Artist" }],
    album: albumRaw
      ? {
          id: typeof albumRaw.id === "string" ? albumRaw.id : undefined,
          name: typeof albumRaw.name === "string" ? albumRaw.name : undefined,
          images: Array.isArray(albumRaw.images)
            ? (albumRaw.images as { url: string }[])
            : undefined,
        }
      : undefined,
    duration_ms:
      typeof item.duration_ms === "number" ? item.duration_ms : undefined,
    external_urls: item.external_urls as { spotify: string } | undefined,
  };
}

function dedupeTracks(
  tracks: SimilarTrack[],
  excludeUri?: string | null,
  excludeId?: string | null,
  excludeIds: Set<string> = new Set()
): SimilarTrack[] {
  const seen = new Set<string>();
  const result: SimilarTrack[] = [];

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

function scoreTrack(track: SimilarTrack, seed: SeedContext): number {
  let score = 0;
  const trackArtistIds = new Set(
    track.artists.map((a) => a.id).filter((id): id is string => !!id)
  );
  const primaryName = seed.artistName.split(",")[0].trim().toLowerCase();

  if (seed.albumId && track.album?.id === seed.albumId) score += 28;
  if (seed.albumName && track.album?.name?.toLowerCase() === seed.albumName.toLowerCase()) {
    score += 12;
  }

  for (const artistId of seed.artistIds) {
    if (trackArtistIds.has(artistId)) score += 18;
  }

  const trackArtistNames = track.artists.map((a) => a.name.toLowerCase());
  if (trackArtistNames.some((n) => n.includes(primaryName) || primaryName.includes(n))) {
    score += 10;
  }

  return score;
}

function rankByRelevance(tracks: SimilarTrack[], seed: SeedContext): SimilarTrack[] {
  return [...tracks].sort((a, b) => scoreTrack(b, seed) - scoreTrack(a, seed));
}

function artistNamesFromString(artistName: string): string[] {
  return [...new Set(artistName.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 3);
}

function artistSearchQuery(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.includes(" ") ? `artist:"${trimmed}"` : `artist:${trimmed}`;
}

async function safeSearch(
  query: string,
  type: string,
  accessToken: string,
  state: FetchState,
  limit = 10,
  offset = 0
): Promise<unknown | null> {
  if (!query.trim() || state.rateLimited || state.searchCalls >= MAX_SEARCH_CALLS_PER_REQUEST) {
    return null;
  }
  state.searchCalls += 1;
  try {
    return await searchSpotify(query, type, accessToken, limit, offset);
  } catch (e) {
    if (e instanceof SpotifyError && e.status === 429) state.rateLimited = true;
    return null;
  }
}

async function searchTracks(
  query: string,
  accessToken: string,
  state: FetchState,
  limit = 10,
  offset = 0
): Promise<SimilarTrack[]> {
  const data = (await safeSearch(query, "track", accessToken, state, limit, offset)) as {
    tracks?: { items?: unknown[] };
  } | null;
  return compactTracks(data?.tracks?.items ?? []);
}

async function topTracksForArtist(
  artistId: string,
  accessToken: string,
  state: FetchState
): Promise<SimilarTrack[]> {
  try {
    const data = (await getArtistTopTracks(artistId, accessToken)) as { tracks?: unknown[] };
    return compactTracks(data?.tracks ?? []);
  } catch (e) {
    if (e instanceof SpotifyError && e.status === 429) state.rateLimited = true;
    return [];
  }
}

async function fetchTrackMeta(
  trackId: string,
  accessToken: string
): Promise<SimilarTrack | null> {
  const data = await spotifyGet(`${SPOTIFY_BASE}/tracks/${trackId}`, accessToken);
  return normalizeSimilarTrack(data);
}

async function resolveArtistIdOnce(
  artistName: string,
  accessToken: string,
  state: FetchState
): Promise<string | null> {
  const primary = artistName.split(",")[0].trim();
  if (!primary) return null;

  const query = artistSearchQuery(primary);
  const data = (await safeSearch(query, "artist", accessToken, state, 5)) as {
    artists?: { items?: { id: string; name: string }[] };
  } | null;
  const items = data?.artists?.items ?? [];
  const match =
    items.find((item) => item.name.toLowerCase() === primary.toLowerCase()) ?? items[0];
  return match?.id ?? null;
}

async function fetchAlbumTracks(
  albumId: string,
  accessToken: string
): Promise<SimilarTrack[]> {
  const album = (await spotifyGet(`${SPOTIFY_BASE}/albums/${albumId}`, accessToken)) as {
    id?: string;
    name?: string;
    images?: { url: string }[];
    release_date?: string;
    album_type?: string;
    external_urls?: { spotify: string };
  } | null;
  if (!album?.id) return [];

  const tracksData = (await spotifyGet(
    `${SPOTIFY_BASE}/albums/${albumId}/tracks?limit=50`,
    accessToken
  )) as { items?: unknown[] } | null;

  const merged: unknown[] = (tracksData?.items ?? []).map((item) => ({
    ...(typeof item === "object" && item ? item : {}),
    album: {
      id: album.id,
      name: album.name,
      images: album.images,
      release_date: album.release_date,
      album_type: album.album_type,
      external_urls: album.external_urls,
    },
  }));

  return compactTracks(merged);
}

function buildSeedFromMeta(
  trackId: string | null,
  trackUri: string | null,
  trackName: string,
  artistName: string,
  meta: SimilarTrack | null,
  resolvedArtistId: string | null
): SeedContext {
  const artistIds = new Set<string>();
  if (meta?.artists) {
    for (const a of meta.artists) {
      if (a.id) artistIds.add(a.id);
    }
  }
  if (resolvedArtistId) artistIds.add(resolvedArtistId);

  const primaryArtistId = meta?.artists?.[0]?.id ?? resolvedArtistId ?? null;

  return {
    trackId: meta?.id ?? trackId,
    trackUri,
    trackName,
    artistName,
    primaryArtistId,
    artistIds: [...artistIds],
    albumId: meta?.album?.id ?? null,
    albumName: meta?.album?.name ?? null,
    genres: [],
  };
}

/**
 * Low-quota similar fetch: track meta → artist top tracks → album → at most 2 searches.
 */
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
): Promise<SimilarFetchResult> {
  const limit = options.limit ?? 15;
  const excluded = options.excludeIds ?? [];
  const refreshSeed = Math.max(0, options.refreshSeed ?? 0);
  const excludeUri = options.trackUri ?? null;
  const excludeId =
    options.trackId?.trim() || spotifyTrackIdFromUri(options.trackUri) || null;
  const excludeIds = new Set(excluded);
  const state: FetchState = { rateLimited: false, searchCalls: 0 };

  const resolvedTrackId = excludeId;
  let meta: SimilarTrack | null = null;
  if (resolvedTrackId) {
    meta = await fetchTrackMeta(resolvedTrackId, accessToken);
  }

  const artistIdsFromMeta = (meta?.artists ?? [])
    .map((a) => a.id)
    .filter((id): id is string => !!id);

  let primaryArtistId: string | null = artistIdsFromMeta[0] ?? null;
  if (!primaryArtistId) {
    primaryArtistId = await resolveArtistIdOnce(options.artistName, accessToken, state);
  }

  const seed = buildSeedFromMeta(
    resolvedTrackId,
    options.trackUri ?? null,
    options.trackName,
    options.artistName,
    meta,
    primaryArtistId
  );

  const pool: SimilarTrack[] = [];
  const artistQueue = [
    ...new Set([...artistIdsFromMeta, primaryArtistId].filter((id): id is string => !!id)),
  ];

  const start = refreshSeed % Math.max(artistQueue.length, 1);
  const orderedArtists = [
    ...artistQueue.slice(start),
    ...artistQueue.slice(0, start),
  ].slice(0, refreshSeed > 0 ? 3 : 2);

  for (const artistId of orderedArtists) {
    pool.push(...(await topTracksForArtist(artistId, accessToken, state)));
    if (state.rateLimited) break;
  }

  if (seed.albumId && !state.rateLimited) {
    pool.push(...(await fetchAlbumTracks(seed.albumId, accessToken)));
  }

  let result = dedupeTracks(
    rankByRelevance(pool, seed),
    excludeUri,
    seed.trackId,
    excludeIds
  );

  if (result.length < limit && !state.rateLimited && state.searchCalls < MAX_SEARCH_CALLS_PER_REQUEST) {
    const primary = options.artistName.split(",")[0].trim();
    const searchQuery = artistSearchQuery(primary);
    if (searchQuery) {
      const extra = await searchTracks(
        searchQuery,
        accessToken,
        state,
        10,
        refreshSeed * 5
      );
      result = dedupeTracks(
        rankByRelevance([...result, ...extra], seed),
        excludeUri,
        seed.trackId,
        excludeIds
      );
    }
  }

  return {
    tracks: result.slice(0, limit),
    rateLimited: state.rateLimited,
  };
}

/** @deprecated Use fetchSimilarTracks — kept for imports */
export async function fetchSimilarTracksFallback(
  accessToken: string,
  trackName: string,
  artistName: string,
  limit: number,
  _refreshSeed: number,
  existing: SimilarTrack[] = []
): Promise<SimilarTrack[]> {
  const { tracks } = await fetchSimilarTracks(accessToken, {
    trackName,
    artistName,
    limit,
  });
  const seen = new Set(existing.map((t) => t.id));
  const out = [...existing];
  for (const t of tracks) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
