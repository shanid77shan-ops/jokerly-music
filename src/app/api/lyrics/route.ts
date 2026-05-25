import { translateLinesToEnglish, translateToEnglish } from "@/lib/translate-to-english";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

type LrcLine = { timeMs: number; text: string };

function parseLrc(lrc: string): LrcLine[] {
  return lrc.split("\n").flatMap((line) => {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!match) return [];
    const ms =
      Number(match[1]) * 60_000 +
      Number(match[2]) * 1_000 +
      Number(match[3].padEnd(3, "0"));
    const text = match[4].trim();
    if (!text) return [];
    return [{ timeMs: ms, text }];
  });
}

async function fetchLyrics(artist: string, track: string) {
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  return res.json() as Promise<{
    syncedLyrics?: string | null;
    plainLyrics?: string | null;
    instrumental?: boolean;
  }>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.trim();
  const track = searchParams.get("track")?.trim();

  if (!artist || !track) {
    return NextResponse.json({ error: "artist and track required" }, { status: 400 });
  }

  try {
    const data = await fetchLyrics(artist, track);
    if (!data) return NextResponse.json({ notFound: true }, { status: 404 });

    if (data.instrumental) {
      return NextResponse.json({ instrumental: true, notFound: true });
    }

    if (data.syncedLyrics) {
      const lines = parseLrc(data.syncedLyrics);
      if (lines.length === 0) {
        return NextResponse.json({ notFound: true });
      }

      const translatedTexts = await translateLinesToEnglish(lines.map((line) => line.text));
      const syncedLines = lines.map((line, index) => ({
        timeMs: line.timeMs,
        text: translatedTexts[index] ?? line.text,
      }));

      return NextResponse.json(
        { syncedLines, translated: true },
        { headers: { "Cache-Control": "private, max-age=86400" } }
      );
    }

    if (data.plainLyrics?.trim()) {
      const plainText = await translateToEnglish(data.plainLyrics);
      return NextResponse.json(
        { plainText, translated: true },
        { headers: { "Cache-Control": "private, max-age=86400" } }
      );
    }

    return NextResponse.json({ notFound: true });
  } catch {
    return NextResponse.json({ error: "Could not load lyrics" }, { status: 500 });
  }
}
