import { getTopTracks, getSimilarTracks } from "@/lib/lastfm";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const track = searchParams.get("track");
  const artist = searchParams.get("artist");

  try {
    // If seed track+artist provided, return similar tracks
    if (track && artist) {
      const similar = await getSimilarTracks(track, artist, 30);
      return NextResponse.json({ tracks: similar });
    }
    // Otherwise return global top charts
    const tracks = await getTopTracks(30);
    return NextResponse.json({ tracks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
