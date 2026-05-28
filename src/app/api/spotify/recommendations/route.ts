import { auth } from "@/lib/auth";
import { getUserTopTracks, searchSpotify } from "@/lib/spotify";
import {
  fetchSimilarTracks,
  normalizeSimilarTrack,
  type SimilarTrack,
} from "@/lib/similar-tracks";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const GENRE_MAP: Record<string, string> = { "r&b": "r-n-b" };
const MAX_EXCLUDE_IDS = 80;
const CACHE_TTL_MS = 90_000;
const CACHE_MAX = 64;

type CacheEntry = { tracks: SimilarTrack[]; rateLimited: boolean; expires: number };
const similarCache = new Map<string, CacheEntry>();

function normalizeList(items: unknown[]): SimilarTrack[] {
  return items.map(normalizeSimilarTrack).filter((t): t is SimilarTrack => !!t);
}

function cacheKey(
  trackId: string | null,
  trackUri: string | null,
  trackName: string,
  artistName: string,
  refreshSeed: number,
  excludeIds: string[]
) {
  return [
    trackId ?? "",
    trackUri ?? "",
    trackName,
    artistName,
    String(refreshSeed),
    excludeIds.join(","),
  ].join("::");
}

function json(tracks: SimilarTrack[], rateLimited = false) {
  return NextResponse.json(
    { tracks, rateLimited: rateLimited || undefined },
    {
      status: rateLimited && tracks.length === 0 ? 429 : 200,
      headers:
        tracks.length > 0
          ? { "Cache-Control": "private, max-age=90, stale-while-revalidate=120" }
          : { "Cache-Control": "no-store" },
    }
  );
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session as { error?: string }).error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Token expired, please re-login" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const trackId = searchParams.get("trackId");
  const trackUri = searchParams.get("trackUri");
  const trackName = searchParams.get("track") ?? "";
  const artistName = searchParams.get("artist") ?? "";
  const genre = searchParams.get("genre");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "15", 10) || 15, 1), 30);
  const excludeIds = (searchParams.get("exclude") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(-MAX_EXCLUDE_IDS);
  const refreshSeed = Math.max(0, parseInt(searchParams.get("refresh") ?? "0", 10) || 0);
  const token = session.accessToken as string;

  try {
    if (trackName.trim() && artistName.trim()) {
      const key = cacheKey(trackId, trackUri, trackName, artistName, refreshSeed, excludeIds);
      const cached = similarCache.get(key);
      if (cached && cached.expires > Date.now()) {
        return json(cached.tracks, cached.rateLimited);
      }

      const { tracks, rateLimited } = await fetchSimilarTracks(token, {
        trackId,
        trackUri,
        trackName,
        artistName,
        limit,
        excludeIds,
        refreshSeed,
      });

      if (tracks.length > 0 || !rateLimited) {
        similarCache.set(key, {
          tracks,
          rateLimited,
          expires: Date.now() + CACHE_TTL_MS,
        });
        if (similarCache.size > CACHE_MAX) {
          const oldest = similarCache.keys().next().value;
          if (oldest) similarCache.delete(oldest);
        }
      }

      return json(tracks, rateLimited);
    }

    if (trackId) {
      const { tracks, rateLimited } = await fetchSimilarTracks(token, {
        trackId,
        trackUri,
        trackName,
        artistName,
        limit,
        excludeIds,
        refreshSeed,
      });
      return json(tracks, rateLimited);
    }

    if (genre) {
      const seed = GENRE_MAP[genre] ?? genre;
      const data = (await searchSpotify(`genre:${seed}`, "track", token, limit)) as {
        tracks?: { items?: unknown[] };
      };
      return json(normalizeList(data.tracks?.items ?? []));
    }

    const data = await getUserTopTracks(token, limit);
    return json(normalizeList((data as { items?: unknown[] }).items ?? []));
  } catch (e) {
    console.error("[recommendations]", e);
    return NextResponse.json(
      { tracks: [], error: "fetch_failed" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
