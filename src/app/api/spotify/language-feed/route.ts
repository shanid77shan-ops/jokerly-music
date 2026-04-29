import { auth } from "@/lib/auth";
import { searchSpotify, SpotifyError } from "@/lib/spotify";
import { getLanguage } from "@/lib/languages";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  let session;
  try { session = await auth(); } catch { return NextResponse.json({ error: "Auth error" }, { status: 401 }); }
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session as { error?: string }).error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Token expired" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const langs = (searchParams.get("langs") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4);
  // When a bust/refresh param is present, use a random offset so Spotify returns different results
  const isBust = searchParams.has("r");
  const offset = isBust ? Math.floor(Math.random() * 60) : 0;

  if (!langs.length) return NextResponse.json({ sections: [] });

  // Fetch all languages in parallel — fastest possible
  const results = await Promise.allSettled(
    langs.map(async (langId) => {
      const lang = getLanguage(langId);
      if (!lang) return null;

      const [trackData, artistData] = await Promise.all([
        searchSpotify(lang.query, "track", session!.accessToken, 10, offset),
        searchSpotify(lang.artistQuery, "artist", session!.accessToken, 6, 0),
      ]);

      return {
        langId,
        label: lang.label,
        emoji: lang.emoji,
        tracks: trackData.tracks?.items ?? [],
        artists: artistData.artists?.items ?? [],
      };
    })
  );

  const sections = results
    .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof getLanguage>> extends null ? never : {
      langId: string; label: string; emoji: string; tracks: unknown[]; artists: unknown[];
    }>> => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);

  // Log any failures for debugging without crashing
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const e = r.reason;
      const status = e instanceof SpotifyError ? e.status : 0;
      console.error(`language-feed failed for ${langs[i]} (${status}):`, e?.message ?? e);
    }
  });

  return NextResponse.json({ sections }, {
    headers: {
      // Short cache — 60s is enough to avoid duplicate requests on fast re-navigation
      "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
    },
  });
}
