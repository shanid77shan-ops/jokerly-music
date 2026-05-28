import { getApiSession, unauthorized } from "@/lib/api-auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export interface FavoriteArtist {
  id: string;
  name: string;
  image?: string | null;
}

export async function GET() {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ languages: [], favoriteArtists: [] });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_language_prefs")
      .select("languages, favorite_artists")
      .eq("user_id", session.spotifyId)
      .maybeSingle();

    if (error) {
      console.error("[preferences GET]", error.message);
      return NextResponse.json({
        languages: ["english"],
        favoriteArtists: [],
        degraded: true,
      });
    }

    const languages = data?.languages;
    return NextResponse.json({
      languages: Array.isArray(languages) ? languages : [],
      favoriteArtists: (data?.favorite_artists as FavoriteArtist[] | null) ?? [],
    });
  } catch (e) {
    console.error("[preferences GET]", e);
    return NextResponse.json({
      languages: ["english"],
      favoriteArtists: [],
      degraded: true,
    });
  }
}

export async function POST(req: NextRequest) {
  const session = await getApiSession();
  if (!session) return unauthorized();
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const updateData: Record<string, unknown> = {
    user_id: session.spotifyId,
    updated_at: new Date().toISOString(),
  };

  if (Array.isArray(body.languages)) updateData.languages = body.languages;
  if (Array.isArray(body.favoriteArtists)) updateData.favorite_artists = body.favoriteArtists;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("user_language_prefs")
      .upsert(updateData, { onConflict: "user_id" });

    if (error) {
      console.error("[preferences POST]", error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[preferences POST]", e);
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }
}
