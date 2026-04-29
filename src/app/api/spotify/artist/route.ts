import { auth } from "@/lib/auth";
import { getArtist } from "@/lib/spotify";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const SPOTIFY = "https://api.spotify.com/v1";

async function searchArtistTracks(artistName: string, artistId: string, token: string) {
  try {
    const q = encodeURIComponent(`artist:"${artistName}"`);
    const res = await fetch(`${SPOTIFY}/search?q=${q}&type=track&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
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

  const { searchParams } = new URL(req.url);
  const id   = searchParams.get("id");
  const name = searchParams.get("name") ?? ""; // passed from client to avoid extra round-trip

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const token = session.accessToken as string;

  // Run ALL three fetches in one parallel round — no sequential awaits, fits well within 10s
  const [infoRes, topRes, moreRes] = await Promise.allSettled([
    getArtist(id, token),
    // market=IN is appropriate for this app; Spotify returns globally available tracks too
    fetch(`${SPOTIFY}/artists/${id}/top-tracks?market=IN`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.ok ? r.json() : { tracks: [] }),
    searchArtistTracks(name, id, token),
  ]);

  const info       = infoRes.status === "fulfilled" ? infoRes.value : null;
  const topTracks  = topRes.status  === "fulfilled" ? (topRes.value.tracks ?? []) : [];
  const moreSongs  = moreRes.status === "fulfilled" ? moreRes.value : [];

  if (!info) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  const topIds   = new Set(topTracks.map((t: any) => t.id));
  const moreTracks = moreSongs.filter((t: any) => !topIds.has(t.id)).slice(0, 10);

  return NextResponse.json({ info, topTracks, moreTracks });
}
