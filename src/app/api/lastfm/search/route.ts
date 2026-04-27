import { searchTracks, searchArtists, searchAlbums } from "@/lib/lastfm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const type = searchParams.get("type") ?? "track";
  const limit = Number(searchParams.get("limit") ?? "20");

  if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    if (type === "track") {
      const tracks = await searchTracks(q, limit);
      return NextResponse.json({ tracks });
    }
    if (type === "artist") {
      const artists = await searchArtists(q, limit);
      return NextResponse.json({ artists });
    }
    if (type === "album") {
      const albums = await searchAlbums(q, limit);
      return NextResponse.json({ albums });
    }
    // all types at once
    const [tracks, artists, albums] = await Promise.all([
      searchTracks(q, 10),
      searchArtists(q, 6),
      searchAlbums(q, 6),
    ]);
    return NextResponse.json({ tracks, artists, albums });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
