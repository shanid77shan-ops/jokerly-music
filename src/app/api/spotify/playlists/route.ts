import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: playlists, error } = await supabase
    .from("playlists")
    .select("id, name, description, image")
    .eq("user_id", session.spotifyId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (playlists ?? []).map((p) => p.id);
  let totals = new Map<string, number>();
  if (ids.length > 0) {
    const { data: tracks } = await supabase
      .from("playlist_tracks")
      .select("playlist_id")
      .in("playlist_id", ids)
      .eq("user_id", session.spotifyId);

    totals = (tracks ?? []).reduce((acc, row) => {
      acc.set(row.playlist_id, (acc.get(row.playlist_id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  const items = (playlists ?? []).map((pl) => ({
    id: pl.id,
    name: pl.name,
    description: pl.description ?? "",
    images: pl.image ? [{ url: pl.image }] : [],
    tracks: { total: totals.get(pl.id) ?? 0 },
    owner: { display_name: "You" },
    external_urls: { spotify: "" },
  }));

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.spotifyId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playlists")
    .insert({
      user_id: session.spotifyId,
      name: String(name).trim(),
      description: String(description ?? "").trim(),
      image: "",
    })
    .select("id, name, description, image")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ...data,
    images: data.image ? [{ url: data.image }] : [],
    tracks: { total: 0 },
    owner: { display_name: "You" },
    external_urls: { spotify: "" },
  });
}
