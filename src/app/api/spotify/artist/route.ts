import { auth } from "@/lib/auth";
import { getArtist, getArtistTopTracks, getRelatedArtists } from "@/lib/spotify";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [info, topTracksData, relatedData] = await Promise.all([
    getArtist(id, session.accessToken).catch((e) => { console.error("getArtist failed:", e); return null; }),
    getArtistTopTracks(id, session.accessToken).catch((e) => { console.error("getArtistTopTracks failed:", e); return { tracks: [] }; }),
    getRelatedArtists(id, session.accessToken).catch(() => ({ artists: [] })),
  ]);

  if (!info) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  return NextResponse.json({
    info,
    topTracks: topTracksData.tracks ?? [],
    related: (relatedData.artists ?? []).slice(0, 8),
  });
}
