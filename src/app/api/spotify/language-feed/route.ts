import { auth } from "@/lib/auth";
import { searchSpotify, SpotifyError } from "@/lib/spotify";
import { getLanguage } from "@/lib/languages";
import { NextRequest, NextResponse } from "next/server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  let session;
  try { session = await auth(); } catch { return NextResponse.json({ error: "Auth error" }, { status: 401 }); }
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session as { error?: string }).error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Token expired" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const langs = (searchParams.get("langs") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);

  if (!langs.length) return NextResponse.json({ sections: [] });

  const sections = [];

  // Sequential fetches to avoid Spotify rate limits (429)
  for (let i = 0; i < langs.length; i++) {
    const langId = langs[i];
    const lang = getLanguage(langId);
    if (!lang) continue;

    if (i > 0) await sleep(120); // small gap between languages

    try {
      const [trackData, artistData] = await Promise.all([
        searchSpotify(lang.query, "track", session.accessToken, 10),
        searchSpotify(lang.artistQuery, "artist", session.accessToken, 6),
      ]);
      sections.push({
        langId,
        label: lang.label,
        emoji: lang.emoji,
        tracks: trackData.tracks?.items ?? [],
        artists: artistData.artists?.items ?? [],
      });
    } catch (e) {
      const status = e instanceof SpotifyError ? e.status : 0;
      console.error(`language-feed failed for ${langId} (${status}):`, e);
      // On 401/429, abort remaining
      if (status === 401 || status === 429) break;
    }
  }

  return NextResponse.json({ sections });
}
