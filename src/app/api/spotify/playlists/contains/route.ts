import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/spotify/playlists/contains?uri=spotify:track:xxx
// Returns { playlistIds: string[] } — the playlists that already contain this track
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ playlistIds: [] });

  const uri = new URL(req.url).searchParams.get("uri");
  if (!uri) return NextResponse.json({ playlistIds: [] });

  const supabase = await createClient();
  const { data } = await supabase
    .from("playlist_tracks")
    .select("playlist_id")
    .eq("user_id", session.spotifyId)
    .eq("track_uri", uri);

  return NextResponse.json({ playlistIds: (data ?? []).map((r) => r.playlist_id) });
}
