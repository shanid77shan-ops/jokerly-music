import { getApiSession, unauthorized } from "@/lib/api-auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (!isSupabaseConfigured()) return NextResponse.json({ data: [] });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("recently_played")
      .select("*")
      .eq("user_id", session.spotifyId)
      .order("played_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[recently-played GET]", error.message);
      return NextResponse.json({ data: [] });
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    console.error("[recently-played GET]", e);
    return NextResponse.json({ data: [] });
  }
}

export async function POST(req: Request) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => null);
  if (!body?.track_uri || !body?.track_name || !body?.track_artist) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("recently_played").upsert(
      {
        user_id: session.spotifyId,
        track_uri: body.track_uri,
        track_name: body.track_name,
        track_artist: body.track_artist,
        track_image: body.track_image ?? null,
        played_at: new Date().toISOString(),
      },
      { onConflict: "user_id,track_uri" }
    );

    if (error) {
      console.error("[recently-played POST]", error.message);
      return NextResponse.json({ ok: true });
    }

    void supabase.rpc("trim_recently_played", { p_user_id: session.spotifyId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[recently-played POST]", e);
    return NextResponse.json({ ok: true });
  }
}
