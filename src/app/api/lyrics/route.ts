import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

type LrcLine = { timeMs: number; text: string };

type LrclibPayload = {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
};

type LyricsResult =
  | { kind: "synced"; syncedLines: LrcLine[] }
  | { kind: "plain"; plainText: string }
  | { kind: "notFound" };

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

function normalizeLrclibRecord(raw: unknown): LrclibPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const synced =
    (typeof row.syncedLyrics === "string" ? row.syncedLyrics : null) ??
    (typeof row.synced_lyrics === "string" ? row.synced_lyrics : null);
  const plain =
    (typeof row.plainLyrics === "string" ? row.plainLyrics : null) ??
    (typeof row.plain_lyrics === "string" ? row.plain_lyrics : null);
  if (!synced && !plain?.trim()) return null;
  return {
    syncedLyrics: synced,
    plainLyrics: plain,
    instrumental: Boolean(row.instrumental),
  };
}

function payloadToResult(data: LrclibPayload): LyricsResult {
  if (data.instrumental) return { kind: "notFound" };

  if (data.syncedLyrics) {
    const syncedLines = parseLrc(data.syncedLyrics);
    if (syncedLines.length > 0) return { kind: "synced", syncedLines };
  }

  if (data.plainLyrics?.trim()) {
    return { kind: "plain", plainText: data.plainLyrics.trim() };
  }

  return { kind: "notFound" };
}

async function fetchLrclibGet(artist: string, track: string): Promise<LrclibPayload | null> {
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return normalizeLrclibRecord(await res.json());
}

async function fetchLrclibSearch(artist: string, track: string): Promise<LrclibPayload | null> {
  const url = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(track)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  for (const row of rows) {
    const normalized = normalizeLrclibRecord(row);
    if (normalized) return normalized;
  }
  return null;
}

async function fetchLyrics(artist: string, track: string): Promise<LrclibPayload | null> {
  const direct = await fetchLrclibGet(artist, track);
  if (direct) return direct;
  return fetchLrclibSearch(artist, track);
}

function artistCandidates(artist: string): string[] {
  const parts = artist
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set([artist.trim(), ...parts])];
}

const CACHE_HEADERS = { "Cache-Control": "private, max-age=86400" };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const artist = searchParams.get("artist")?.trim();
  const track = searchParams.get("track")?.trim();

  if (!artist || !track) {
    return NextResponse.json({ error: "artist and track required" }, { status: 400 });
  }

  try {
    for (const candidate of artistCandidates(artist)) {
      const data = await fetchLyrics(candidate, track);
      if (!data) continue;

      const result = payloadToResult(data);
      if (result.kind === "synced") {
        return NextResponse.json({ syncedLines: result.syncedLines }, { headers: CACHE_HEADERS });
      }
      if (result.kind === "plain") {
        return NextResponse.json({ plainText: result.plainText }, { headers: CACHE_HEADERS });
      }
    }

    return NextResponse.json({ notFound: true });
  } catch {
    return NextResponse.json({ error: "Could not load lyrics" }, { status: 500 });
  }
}
