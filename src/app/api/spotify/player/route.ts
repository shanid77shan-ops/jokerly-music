import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const SPOTIFY_BASE = "https://api.spotify.com/v1";

type PlayerAction = "play" | "repeat" | "shuffle";

interface PlayBody {
  action: "play";
  deviceId: string;
  uris: string[];
  offset?: { position: number };
  positionMs?: number;
}

interface RepeatBody {
  action: "repeat";
  deviceId: string;
  state: "off" | "context" | "track";
}

interface ShuffleBody {
  action: "shuffle";
  deviceId: string;
  state: boolean;
}

type PlayerBody = PlayBody | RepeatBody | ShuffleBody;

async function spotifyPlayerRequest(path: string, accessToken: string, init: RequestInit) {
  const res = await fetch(`${SPOTIFY_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: text || `Spotify API ${res.status}` },
      { status: res.status }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as PlayerBody;
  if (!body?.action || !body.deviceId) {
    return NextResponse.json({ error: "Missing player action or device" }, { status: 400 });
  }

  switch (body.action as PlayerAction) {
    case "play": {
      const playBody = body as PlayBody;
      if (!Array.isArray(playBody.uris) || playBody.uris.length === 0) {
        return NextResponse.json({ error: "Track uris required" }, { status: 400 });
      }
      return spotifyPlayerRequest(
        `/me/player/play?device_id=${encodeURIComponent(playBody.deviceId)}`,
        session.accessToken,
        {
          method: "PUT",
          body: JSON.stringify({
            uris: playBody.uris,
            offset: playBody.offset,
            position_ms: playBody.positionMs ?? 0,
          }),
        }
      );
    }
    case "repeat": {
      const repeatBody = body as RepeatBody;
      return spotifyPlayerRequest(
        `/me/player/repeat?state=${encodeURIComponent(repeatBody.state)}&device_id=${encodeURIComponent(repeatBody.deviceId)}`,
        session.accessToken,
        { method: "PUT" }
      );
    }
    case "shuffle": {
      const shuffleBody = body as ShuffleBody;
      return spotifyPlayerRequest(
        `/me/player/shuffle?state=${shuffleBody.state}&device_id=${encodeURIComponent(shuffleBody.deviceId)}`,
        session.accessToken,
        { method: "PUT" }
      );
    }
    default:
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
}
