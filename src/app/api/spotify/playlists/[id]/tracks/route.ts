import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { uri } = await req.json();
  if (!uri) return NextResponse.json({ error: "URI required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("playlist_tracks")
    .delete()
    .eq("playlist_id", id)
    .eq("user_id", session.spotifyId)
    .eq("track_uri", uri);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
