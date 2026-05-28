import { auth } from "@/lib/auth";
import { getRelatedArtists } from "@/lib/spotify";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids") ?? searchParams.get("id") ?? "";
  const seedIds = idsParam.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 5);
  const excludeIds = new Set(
    (searchParams.get("exclude") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );

  if (seedIds.length === 0) {
    return NextResponse.json({ error: "Artist id required" }, { status: 400 });
  }

  const seen = new Set<string>([...seedIds, ...excludeIds]);
  const artists: unknown[] = [];

  for (const artistId of seedIds) {
    try {
      const data = await getRelatedArtists(artistId, session.accessToken);
      for (const artist of data.artists ?? []) {
        if (!artist?.id || seen.has(artist.id)) continue;
        seen.add(artist.id);
        artists.push(artist);
      }
    } catch {
      // continue with other seed artists
    }
  }

  return NextResponse.json({ artists });
}
