import { auth } from "@/lib/auth";
import { getArtist } from "@/lib/spotify";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const SPOTIFY = "https://api.spotify.com/v1";

async function spotifyGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  return res.json();
}

// Fetch top tracks — try without market first (uses user's country), fallback to IN
async function fetchTopTracks(artistId: string, token: string) {
  try {
    const data = await spotifyGet(`${SPOTIFY}/artists/${artistId}/top-tracks`, token);
    if (data?.tracks?.length) return data.tracks;
    // fallback with explicit market
    const fallback = await spotifyGet(`${SPOTIFY}/artists/${artistId}/top-tracks?market=US`, token);
    return fallback?.tracks ?? [];
  } catch {
    return [];
  }
}

// Search for tracks by artist name — broad match, no ID filter so film composers appear
async function searchArtistTracks(artistName: string, artistId: string, token: string) {
  try {
    const q = encodeURIComponent(`artist:"${artistName}"`);
    const data = await spotifyGet(`${SPOTIFY}/search?q=${q}&type=track&limit=50`, token);
    const items = data?.tracks?.items ?? [];
    // prefer tracks where this artist is directly credited, then include others
    const direct = items.filter((t: any) => t.artists?.some((a: any) => a.id === artistId));
    const indirect = items.filter((t: any) => !t.artists?.some((a: any) => a.id === artistId));
    return [...direct, ...indirect];
  } catch {
    return [];
  }
}

// Get tracks from artist's own albums/singles (great for composers & solo artists)
async function fetchAlbumTracks(artistId: string, token: string) {
  try {
    const albums = await spotifyGet(
      `${SPOTIFY}/artists/${artistId}/albums?include_groups=album,single&limit=5`,
      token
    );
    const albumItems: any[] = albums?.items ?? [];
    const trackLists = await Promise.allSettled(
      albumItems.slice(0, 3).map((album) =>
        spotifyGet(`${SPOTIFY}/albums/${album.id}/tracks?limit=10`, token).then((d) =>
          (d?.items ?? []).map((t: any) => ({ ...t, album }))
        )
      )
    );
    return trackLists
      .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id   = searchParams.get("id");
  const name = searchParams.get("name") ?? "";

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const token = session.accessToken as string;

  const [infoRes, topRes, searchRes, albumRes] = await Promise.allSettled([
    getArtist(id, token),
    fetchTopTracks(id, token),
    searchArtistTracks(name, id, token),
    fetchAlbumTracks(id, token),
  ]);

  const info       = infoRes.status   === "fulfilled" ? infoRes.value   : null;
  const topTracks  = topRes.status    === "fulfilled" ? topRes.value    : [];
  const searchMore = searchRes.status === "fulfilled" ? searchRes.value : [];
  const albumMore  = albumRes.status  === "fulfilled" ? albumRes.value  : [];

  if (!info) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  const topIds = new Set(topTracks.map((t: any) => t.id));

  // Merge search + album tracks, dedupe against topTracks
  const seen = new Set(topIds);
  const moreTracks: any[] = [];
  for (const t of [...searchMore, ...albumMore]) {
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    moreTracks.push(t);
    if (moreTracks.length >= 20) break;
  }

  return NextResponse.json({ info, topTracks, moreTracks });
}
