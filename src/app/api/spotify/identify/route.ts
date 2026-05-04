import { auth } from "@/lib/auth";
import { searchSpotify } from "@/lib/spotify";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { promises as fs } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg") as { path: string };

const execFileAsync = promisify(execFile);

// On Vercel (Linux) use the bundled static binary; elsewhere fall back to PATH.
const FFMPEG_PATH = ffmpegInstaller.path;
const FPCALC_PATH =
  process.platform === "linux"
    ? join(process.cwd(), "bin", "fpcalc")
    : "fpcalc";

export const runtime = "nodejs";
export const maxDuration = 45;

interface AcoustIdArtist {
  name?: string;
}

interface AcoustIdRecording {
  title?: string;
  artists?: AcoustIdArtist[];
}

interface AcoustIdResult {
  score?: number;
  recordings?: AcoustIdRecording[];
}

interface AcoustIdResponse {
  status?: string;
  results?: AcoustIdResult[];
}

async function computeFingerprint(audioPath: string) {
  const wavPath = join(tmpdir(), `${randomUUID()}.wav`);
  try {
    await execFileAsync(FFMPEG_PATH, ["-y", "-i", audioPath, "-ac", "1", "-ar", "11025", wavPath]);
    const { stdout } = await execFileAsync(FPCALC_PATH, ["-json", wavPath]);
    const parsed = JSON.parse(stdout) as { duration?: number; fingerprint?: string };
    if (!parsed.duration || !parsed.fingerprint) {
      throw new Error("Could not generate fingerprint");
    }
    return { duration: Math.round(parsed.duration), fingerprint: parsed.fingerprint };
  } finally {
    await fs.unlink(wavPath).catch(() => undefined);
  }
}

function pickBestMatch(payload: AcoustIdResponse) {
  const ranked = (payload.results ?? [])
    .filter((result) => (result.recordings?.length ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const first = ranked[0]?.recordings?.[0];
  const title = first?.title?.trim();
  const artist = first?.artists?.map((a) => a.name?.trim()).filter(Boolean).join(", ");
  if (!title || !artist) return null;
  return { title, artist };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const acoustIdKey = process.env.ACOUSTID_API_KEY;
  if (!acoustIdKey) {
    return NextResponse.json({ error: "Song identification is not configured" }, { status: 503 });
  }

  const formData = await req.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  }

  const inputPath = join(tmpdir(), `${randomUUID()}.webm`);

  try {
    const audioBuffer = Buffer.from(await audio.arrayBuffer());
    await fs.writeFile(inputPath, audioBuffer);

    let fingerprintData: { duration: number; fingerprint: string };
    try {
      fingerprintData = await computeFingerprint(inputPath);
    } catch {
      return NextResponse.json(
        { error: "Audio fingerprint tools not found. Install ffmpeg and fpcalc on server." },
        { status: 503 }
      );
    }

    const acoustParams = new URLSearchParams({
      client: acoustIdKey,
      meta: "recordings",
      duration: String(fingerprintData.duration),
      fingerprint: fingerprintData.fingerprint,
    });

    const acoustRes = await fetch(`https://api.acoustid.org/v2/lookup?${acoustParams}`);
    if (!acoustRes.ok) {
      return NextResponse.json({ error: "Song identification failed" }, { status: 502 });
    }

    const acoustPayload = (await acoustRes.json().catch(() => ({}))) as AcoustIdResponse;
    const found = pickBestMatch(acoustPayload);
    if (!found) {
      return NextResponse.json({ error: "No match found" }, { status: 404 });
    }

    try {
      const result = await searchSpotify(`track:${found.title} artist:${found.artist}`, "track", session.accessToken, 1);
      const first = result?.tracks?.items?.[0];
      if (!first) {
        return NextResponse.json({
          match: {
            title: found.title,
            artist: found.artist,
            uri: null,
            imageUrl: null,
            durationMs: null,
          },
        });
      }

      return NextResponse.json({
        match: {
          title: first.name ?? found.title,
          artist: Array.isArray(first.artists) ? first.artists.map((a: { name?: string }) => a.name).filter(Boolean).join(", ") : found.artist,
          uri: first.uri ?? null,
          imageUrl: first.album?.images?.[0]?.url ?? null,
          durationMs: typeof first.duration_ms === "number" ? first.duration_ms : null,
        },
      });
    } catch {
      return NextResponse.json({
        match: {
          title: found.title,
          artist: found.artist,
          uri: null,
          imageUrl: null,
          durationMs: null,
        },
      });
    }
  } finally {
    await fs.unlink(inputPath).catch(() => undefined);
  }
}
