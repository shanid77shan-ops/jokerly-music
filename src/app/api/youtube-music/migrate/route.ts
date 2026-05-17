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

    // Normalize cookie input: accept either the full cookie string or just the value of __Secure-1PAPISID
    let normalizedCookie = cookieString.trim();
    if (!normalizedCookie.includes("=")) {
      normalizedCookie = `__Secure-1PAPISID=${normalizedCookie}`;
    }

    const result = await migrateTracksToYTPlaylist(normalizedCookie, playlistName, playlistDescription, tracksToMove, privacy);
    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[YouTube Music Export Error]", errorMessage, error);
    // If the underlying library returned a 401, return a clear authentication error
    if (errorMessage.includes("401") || /auth|unauthor/i.test(errorMessage)) {
      return NextResponse.json(
        { error: "Authentication failed: please paste the full Cookie header value from music.youtube.com (copy Request → Headers → Cookie in DevTools)" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
