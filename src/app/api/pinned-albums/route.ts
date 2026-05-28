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
      .from("pinned_albums")
      .select("*")
      .eq("user_id", session.spotifyId)
      .order("pinned_at", { ascending: false });

    if (error) {
      console.error("[pinned-albums GET]", error.message);
      return NextResponse.json([]);
    }
    return NextResponse.json(data ?? [], {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    });
  } catch (e) {
    console.error("[pinned-albums GET]", e);
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
      .from("pinned_albums")
      .upsert({
        user_id: session.spotifyId,
        album_id: body.album_id,
        album_name: body.album_name,
        album_image: body.album_image ?? "",
        artist_name: body.artist_name ?? "",
        pinned_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[pinned-albums POST]", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { album_id } = await req.json();
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pinned_albums")
      .delete()
      .eq("user_id", session.spotifyId)
      .eq("album_id", album_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[pinned-albums DELETE]", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
