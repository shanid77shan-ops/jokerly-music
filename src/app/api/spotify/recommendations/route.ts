import { auth } from "@/lib/auth";
import {
  getUserTopTracks,
  getRecommendationsByGenre,
} from "@/lib/spotify";
import { fetchSimilarTracks } from "@/lib/similar-tracks";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const GENRE_MAP: Record<string, string> = { "r&b": "r-n-b" };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const trackId = searchParams.get("trackId");
  const trackUri = searchParams.get("trackUri");
  const trackName = searchParams.get("track");
  const artistName = searchParams.get("artist");
  const genre = searchParams.get("genre");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "15", 10) || 15, 1), 20);
  const excludeIds = (searchParams.get("exclude") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const refreshSeed = Math.max(0, parseInt(searchParams.get("refresh") ?? "0", 10) || 0);

  try {
    if (trackName && artistName) {
      const tracks = await fetchSimilarTracks(session.accessToken, {
        trackId,
        trackUri,
        trackName,
        artistName,
        limit,
        excludeIds,
        refreshSeed,
      });
      return NextResponse.json(
        { tracks },
        { headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" } }
      );
    }

    if (trackId) {
      const tracks = await fetchSimilarTracks(session.accessToken, {
        trackId,
        trackUri,
        trackName: trackName ?? "",
        artistName: artistName ?? "",
        limit,
      });
      return NextResponse.json({ tracks });
    }

    if (genre) {
      const seed = GENRE_MAP[genre] ?? genre;
      const data = await getRecommendationsByGenre(seed, session.accessToken, limit);
      return NextResponse.json({ tracks: data.tracks ?? [] });
    }

    const data = await getUserTopTracks(session.accessToken, limit);
    return NextResponse.json({ tracks: data.items ?? [] });
  } catch {
    try {
      const data = await getRecommendationsByGenre("pop", session.accessToken, limit);
      return NextResponse.json({ tracks: data.tracks ?? [] });
    } catch {
      return NextResponse.json({ tracks: [] });
    }
  }
}
