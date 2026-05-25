import { auth } from "@/lib/auth";
import {
  compilePlaylist,
  parseSelectedArtists,
  type CompileArtist,
} from "@/lib/compile-playlist";
import {
  diffMixArtists,
  formatMixDescription,
  parseMixArtistRecords,
  trackMatchesArtist,
  type MixArtist,
} from "@/lib/playlist-meta";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playlists")
    .select("description")
    .eq("id", id)
    .eq("user_id", session.spotifyId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });

  return NextResponse.json({ artists: parseMixArtistRecords(data.description) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.spotifyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.accessToken) {
    return NextResponse.json({ error: "Session expired — please log in again" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { selectedArtists?: unknown };
  const selectedArtists = parseSelectedArtists(body.selectedArtists) as MixArtist[];

  if (selectedArtists.length === 0) {
    return NextResponse.json({ error: "At least one artist required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: playlist, error: playlistError } = await supabase
    .from("playlists")
    .select("id, description")
    .eq("id", id)
    .eq("user_id", session.spotifyId)
    .single();

  if (playlistError || !playlist) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  const previous = parseMixArtistRecords(playlist.description);
  const { added, removed } = diffMixArtists(previous, selectedArtists);

  const { error: updateError } = await supabase
    .from("playlists")
    .update({ description: formatMixDescription(selectedArtists) })
    .eq("id", id)
    .eq("user_id", session.spotifyId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  let removedCount = 0;
  if (removed.length > 0) {
    const { data: tracks, error: tracksError } = await supabase
      .from("playlist_tracks")
      .select("id, track_artist")
      .eq("playlist_id", id)
      .eq("user_id", session.spotifyId);

    if (tracksError) return NextResponse.json({ error: tracksError.message }, { status: 500 });

    const idsToRemove = (tracks ?? [])
      .filter((track) =>
        removed.some((artist) => trackMatchesArtist(track.track_artist, artist.name))
      )
      .map((track) => track.id);

    if (idsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("playlist_tracks")
        .delete()
        .in("id", idsToRemove)
        .eq("user_id", session.spotifyId);

      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
      removedCount = idsToRemove.length;
    }
  }

  let addedCount = 0;
  if (added.length > 0) {
    try {
      const result = await compilePlaylist(
        session.accessToken,
        id,
        session.spotifyId,
        added as CompileArtist[],
        supabase
      );
      addedCount = result.addedCount;
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message ?? "Could not add tracks for new artists" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    artists: selectedArtists,
    description: formatMixDescription(selectedArtists),
    addedCount,
    removedCount,
  });
}
