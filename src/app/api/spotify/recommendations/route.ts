import { auth } from "@/lib/auth";
import {
  getRecommendations,
  getUserTopTracks,
  getUserTopArtists,
} from "@/lib/spotify";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [topTracks, topArtists] = await Promise.all([
    getUserTopTracks(session.accessToken, 5),
    getUserTopArtists(session.accessToken, 5),
  ]);

  const seedTracks = (topTracks.items ?? []).slice(0, 3).map((t: any) => t.id);
  const seedArtists = (topArtists.items ?? []).slice(0, 2).map((a: any) => a.id);

  const recs = await getRecommendations(seedTracks, seedArtists, session.accessToken, 30);
  return NextResponse.json({ tracks: recs.tracks ?? [] });
}
