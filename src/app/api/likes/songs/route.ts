import { getApiSession, unauthorized } from "@/lib/api-auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (!isSupabaseConfigured()) return NextResponse.json([]);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("liked_songs")
      .select("*")
      .eq("user_id", session.spotifyId)
      .order("liked_at", { ascending: false });

    if (error) {
      console.error("[likes/songs GET]", error.message);
      return NextResponse.json([]);
    }
    return NextResponse.json(data ?? [], {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[likes/songs GET]", e);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const body = await req.json();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("liked_songs")
      .upsert({
        user_id: session.spotifyId,
        track_uri: body.track_uri,
        track_name: body.track_name,
        track_image: body.track_image ?? null,
        track_artist: body.track_artist ?? null,
        liked_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[likes/songs POST]", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { track_uri } = await req.json();
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("liked_songs")
      .delete()
      .eq("user_id", session.spotifyId)
      .eq("track_uri", track_uri);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[likes/songs DELETE]", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
