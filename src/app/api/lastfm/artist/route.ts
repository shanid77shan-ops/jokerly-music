import { getArtistInfo, getSimilarArtists, getArtistTopTracks } from "@/lib/lastfm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");

  if (!name) return NextResponse.json({ error: "Missing artist name" }, { status: 400 });

  try {
    const [info, similar, topTracks] = await Promise.all([
      getArtistInfo(name),
      getSimilarArtists(name, 8),
      getArtistTopTracks(name, 10),
    ]);
    return NextResponse.json({ info, similar, topTracks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
