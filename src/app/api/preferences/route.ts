import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export interface FavoriteArtist {
  id: string;
  name: string;
  image?: string | null;
}

export async function GET() {
  let session;
  try { session = await auth(); } catch { return NextResponse.json({ error: "Auth error" }, { status: 401 }); }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_language_prefs")
    .select("languages, favorite_artists")
    .eq("user_id", session.spotifyId)
    .single();

  return NextResponse.json({
    languages: data?.languages ?? null,
    favoriteArtists: (data?.favorite_artists as FavoriteArtist[] | null) ?? [],
  });
}

export async function POST(req: NextRequest) {
  let session;
  try { session = await auth(); } catch { return NextResponse.json({ error: "Auth error" }, { status: 401 }); }
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updateData: Record<string, unknown> = {
    user_id: session.spotifyId,
    updated_at: new Date().toISOString(),
  };

  if (Array.isArray(body.languages)) updateData.languages = body.languages;
  if (Array.isArray(body.favoriteArtists)) updateData.favorite_artists = body.favoriteArtists;

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_language_prefs")
    .upsert(updateData, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
