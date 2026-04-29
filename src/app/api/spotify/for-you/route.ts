import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

async function spotifyFetch(url: string, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function GET(req: NextRequest) {
  let session;
  try { session = await auth(); } catch { return NextResponse.json({ tracks: [] }); }
  if (!session?.accessToken) return NextResponse.json({ tracks: [] });

  const { searchParams } = new URL(req.url);
  const artistIds = (searchParams.get("artists") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);

  if (!artistIds.length) return NextResponse.json({ tracks: [] });

  // Spotify recommendations with seed artists
  const params = new URLSearchParams({
    seed_artists: artistIds.slice(0, 5).join(","),
    limit: "20",
    market: "from_token",
  });

  const data = await spotifyFetch(
    `https://api.spotify.com/v1/recommendations?${params}`,
    session.accessToken
  );

  return NextResponse.json(
    { tracks: data?.tracks ?? [] },
    { headers: { "Cache-Control": "private, max-age=180, stale-while-revalidate=60" } }
  );
}
