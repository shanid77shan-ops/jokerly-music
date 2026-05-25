import { auth } from "@/lib/auth";
import {
  getUserTopTracks,
  getRecommendationsByTrack,
  getRecommendationsByGenre,
  searchSpotify,
} from "@/lib/spotify";
import { spotifyTrackIdFromUri } from "@/lib/spotify-track-id";
import { NextRequest, NextResponse } from "next/server";

const GENRE_MAP: Record<string, string> = { "r&b": "r-n-b" };

async function resolveTrackId(
  trackId: string | null,
  trackUri: string | null,
  trackName: string | null,
  artistName: string | null,
  accessToken: string
): Promise<string | null> {
  if (trackId) return trackId;
  const fromUri = spotifyTrackIdFromUri(trackUri);
  if (fromUri) return fromUri;
  if (!trackName || !artistName) return null;

  const data = await searchSpotify(
    `track:${trackName} artist:${artistName.split(",")[0].trim()}`,
    "track",
    accessToken,
    3
  );
  return data?.tracks?.items?.[0]?.id ?? null;
}

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

  try {
    const resolvedId = await resolveTrackId(
      trackId,
      trackUri,
      trackName,
      artistName,
      session.accessToken
    );

    if (resolvedId) {
      const data = await getRecommendationsByTrack(resolvedId, session.accessToken, limit);
      return NextResponse.json({ tracks: data.tracks ?? [], trackId: resolvedId });
    }

    if (trackId) {
      const data = await getRecommendationsByTrack(trackId, session.accessToken, limit);
      return NextResponse.json({ tracks: data.tracks ?? [] });
    }
    if (genre) {
      const seed = GENRE_MAP[genre] ?? genre;
      const data = await getRecommendationsByGenre(seed, session.accessToken, 20);
      return NextResponse.json({ tracks: data.tracks ?? [] });
    }
    const data = await getUserTopTracks(session.accessToken, 20);
    return NextResponse.json({ tracks: data.items ?? [] });
  } catch {
    try {
      const data = await getRecommendationsByGenre("pop", session.accessToken, 20);
      return NextResponse.json({ tracks: data.tracks ?? [] });
    } catch {
      return NextResponse.json({ tracks: [] });
    }
  }
}
