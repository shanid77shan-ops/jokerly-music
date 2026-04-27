import { getTopTracks, getTopArtists } from "@/lib/lastfm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [tracks, artists] = await Promise.all([
      getTopTracks(10),
      getTopArtists(8),
    ]);
    return NextResponse.json({ tracks, artists });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
