import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 20;

const SPOTIFY = "https://api.spotify.com/v1";

async function spotifyGet(url: string, token: string) {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const token = session.accessToken as string;

  const [albumData, tracksData] = await Promise.allSettled([
    spotifyGet(`${SPOTIFY}/albums/${id}`, token),
    spotifyGet(`${SPOTIFY}/albums/${id}/tracks?limit=50`, token),
  ]);

  const album = albumData.status === "fulfilled" ? albumData.value : null;
  if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });

  const rawTracks: any[] = tracksData.status === "fulfilled" ? (tracksData.value?.items ?? []) : [];

  // Simplified tracks from /albums/{id}/tracks lack album images — merge them in
  const tracks = rawTracks.map((t: any) => ({
    ...t,
    album: {
      id: album.id,
      name: album.name,
      images: album.images,
      release_date: album.release_date,
      album_type: album.album_type,
      external_urls: album.external_urls,
    },
  }));

  return NextResponse.json({ album, tracks });
}
