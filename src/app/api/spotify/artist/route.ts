import { auth } from "@/lib/auth";
import { getArtist } from "@/lib/spotify";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// Search Spotify for tracks by this artist, returning an array of track objects
async function searchArtistTracks(artistName: string, artistId: string, accessToken: string) {
  try {
    const q = encodeURIComponent(`artist:"${artistName}"`);
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=20`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // Only keep tracks that actually belong to this artist
    return (data.tracks?.items ?? []).filter((t: any) =>
      t.artists?.some((a: any) => a.id === artistId)
    );
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const token = session.accessToken as string;

  // Fetch artist info + user country in parallel
  const [info, meData] = await Promise.all([
    getArtist(id, token).catch((e) => { console.error("getArtist failed:", e); return null; }),
    fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) })
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null),
  ]);

  if (!info) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  // Use the user's actual country for market-restricted endpoints (top-tracks requires a real ISO code)
  const market: string = meData?.country ?? "US";

  // Fetch top tracks + more songs in parallel
  const [topTracksData, similarData] = await Promise.all([
    fetch(`https://api.spotify.com/v1/artists/${id}/top-tracks?market=${market}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
    })
      .then((r) => r.ok ? r.json() : { tracks: [] })
      .catch(() => ({ tracks: [] })),
    searchArtistTracks(info.name ?? "", id, token),
  ]);

  const topTrackIds = new Set((topTracksData.tracks ?? []).map((t: any) => t.id));
  // Filter out tracks already shown in Top Tracks to avoid duplicates
  const moreTracks = (similarData ?? []).filter((t: any) => !topTrackIds.has(t.id)).slice(0, 10);

  return NextResponse.json({
    info,
    topTracks: topTracksData.tracks ?? [],
    moreTracks,
  });
}
