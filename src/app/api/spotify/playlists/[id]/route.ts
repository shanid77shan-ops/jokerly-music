import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playlist_tracks")
    .select("track_uri, track_name, track_image, track_artist, added_at")
    .eq("user_id", session.spotifyId)
    .eq("playlist_id", id)
    .order("added_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { name, description } = await req.json();

  const supabase = await createClient();
  const { error } = await supabase
    .from("playlists")
    .update({ name: String(name ?? ""), description: String(description ?? "") })
    .eq("id", id)
    .eq("user_id", session.spotifyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { uris, trackName, trackImage, trackArtist } = await req.json();
  const uri = Array.isArray(uris) ? uris[0] : null;
  if (!uri) return NextResponse.json({ error: "Track uri required" }, { status: 400 });

  const supabase = await createClient();

  // Check if this exact track is already in the playlist (for duplicate detection)
  const { data: existing } = await supabase
    .from("playlist_tracks")
    .select("id")
    .eq("user_id", session.spotifyId)
    .eq("playlist_id", id)
    .eq("track_uri", uri)
    .maybeSingle();

  // If it already exists, update added_at so it moves to the top
  // (upsert by id so we never silently swallow the row)
  if (existing?.id) {
    await supabase
      .from("playlist_tracks")
      .update({ added_at: new Date().toISOString() })
      .eq("id", existing.id);
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // New track — plain insert
  const { data, error } = await supabase
    .from("playlist_tracks")
    .insert({
      user_id: session.spotifyId,
      playlist_id: id,
      track_uri: uri,
      track_name: String(trackName ?? "Track"),
      track_image: trackImage ?? null,
      track_artist: trackArtist ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.spotifyId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const supabase = await createClient();
  const { error } = await supabase
    .from("playlists")
    .delete()
    .eq("id", id)
    .eq("user_id", session.spotifyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("pinned_playlists")
    .delete()
    .eq("user_id", session.spotifyId)
    .eq("playlist_id", id);

  return NextResponse.json({ ok: true });
}
