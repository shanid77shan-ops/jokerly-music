import { NextRequest, NextResponse } from "next/server";
import { migrateTracksToYTPlaylist, YTMTrackSearchPayload, YTMPrivacy } from "@/lib/youtubeMusic";

interface MigrateRequestBody {
  cookieString: string;
  playlistName: string;
  playlistDescription?: string;
  privacy?: YTMPrivacy;
  tracksToMove: YTMTrackSearchPayload[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MigrateRequestBody;
    const { cookieString, playlistName, playlistDescription = "", privacy = "PRIVATE", tracksToMove } = body;

    if (!cookieString || typeof cookieString !== "string") {
      return NextResponse.json({ error: "Cookie string is required" }, { status: 400 });
    }
    if (!playlistName || typeof playlistName !== "string") {
      return NextResponse.json({ error: "Playlist name is required" }, { status: 400 });
    }
    if (!Array.isArray(tracksToMove) || tracksToMove.length === 0) {
      return NextResponse.json({ error: "tracksToMove must be a non-empty array" }, { status: 400 });
    }

    const result = await migrateTracksToYTPlaylist(cookieString, playlistName, playlistDescription, tracksToMove, privacy);
    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[YouTube Music Export Error]", errorMessage, error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
