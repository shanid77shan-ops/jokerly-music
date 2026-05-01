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
    .select("id, track_uri, track_name, track_image, track_artist, added_at, position")
    .eq("user_id", session.spotifyId)
    .eq("playlist_id", id)
    .order("position", { ascending: true });

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

  // Get the next position (add to bottom of list)
  const { count } = await supabase
    .from("playlist_tracks")
    .select("id", { count: "exact", head: true })
    .eq("playlist_id", id)
    .eq("user_id", session.spotifyId);

  const { data, error } = await supabase
    .from("playlist_tracks")
    .insert({
      user_id: session.spotifyId,
      playlist_id: id,
      track_uri: uri,
      track_name: String(trackName ?? "Track"),
      track_image: trackImage ?? null,
      track_artist: trackArtist ?? null,
      position: (count ?? 0) + 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH /api/spotify/playlists/[id] — reorder tracks
// Body: { order: string[] }  — array of track row IDs in the new order
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { order } = await req.json() as { order: string[] };
  if (!Array.isArray(order)) return NextResponse.json({ error: "order must be an array" }, { status: 400 });

  const supabase = await createClient();
  await Promise.all(
    order.map((trackId, index) =>
      supabase
        .from("playlist_tracks")
        .update({ position: index + 1 })
        .eq("id", trackId)
        .eq("playlist_id", id)
        .eq("user_id", session.spotifyId)
    )
  );
  return NextResponse.json({ ok: true });
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
