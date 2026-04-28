import { auth } from "@/lib/auth";
import { searchSpotify } from "@/lib/spotify";
import { getLanguage } from "@/lib/languages";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  let session;
  try { session = await auth(); } catch { return NextResponse.json({ error: "Auth error" }, { status: 401 }); }
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const langs = (searchParams.get("langs") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!langs.length) return NextResponse.json({ sections: [] });

  const sections = await Promise.all(
    langs.slice(0, 5).map(async (langId) => {
      const lang = getLanguage(langId);
      if (!lang) return null;
      try {
        const [trackData, artistData] = await Promise.all([
          searchSpotify(lang.query, "track", session.accessToken, 10),
          searchSpotify(lang.artistQuery, "artist", session.accessToken, 6),
        ]);
        return {
          langId,
          label: lang.label,
          emoji: lang.emoji,
          tracks: trackData.tracks?.items ?? [],
          artists: artistData.artists?.items ?? [],
        };
      } catch (e) {
        console.error(`language-feed failed for ${langId}:`, e);
        return null;
      }
    })
  );

  return NextResponse.json({ sections: sections.filter(Boolean) });
}
