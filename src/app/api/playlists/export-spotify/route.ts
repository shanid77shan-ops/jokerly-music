import { auth } from "@/lib/auth";

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const SPOTIFY_TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

type ExportSpotifyPayload = {
  name?: unknown;
  trackIds?: unknown;
};

type SpotifyPlaylistResponse = {
  id?: string;
  external_urls?: {
    spotify?: string;
  };
};

type SpotifyErrorResponse = {
  error?: {
    message?: string;
  };
  message?: string;
};

function jsonError(error: string, status: number, message?: string) {
  return Response.json({ error, ...(message ? { message } : {}) }, { status });
}

async function readSpotifyError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as SpotifyErrorResponse;
    return body.error?.message ?? body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.accessToken || !session?.spotifyId) {
    return jsonError("Unauthorized", 401);
  }

  let payload: ExportSpotifyPayload;

  try {
    payload = (await request.json()) as ExportSpotifyPayload;
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const rawTrackIds = Array.isArray(payload.trackIds) ? payload.trackIds : null;

  if (!name) {
    return jsonError("Playlist name is required", 400);
  }

  if (
    !rawTrackIds?.length ||
    rawTrackIds.some((trackId) => typeof trackId !== "string" || !SPOTIFY_TRACK_ID_PATTERN.test(trackId.trim()))
  ) {
    return jsonError("trackIds must be a non-empty array of Spotify track IDs", 400);
  }

  const trackUris = rawTrackIds.map((trackId) => `spotify:track:${trackId.trim()}`);

  try {
    const createPlaylistResponse = await fetch(
      `${SPOTIFY_API_BASE_URL}/users/${encodeURIComponent(session.spotifyId)}/playlists`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: "Exported from Jokerly",
          public: false,
        }),
      }
    );

    if (!createPlaylistResponse.ok) {
      const message = await readSpotifyError(createPlaylistResponse);
      return jsonError("Failed to create Spotify playlist", createPlaylistResponse.status, message);
    }

    const playlist = (await createPlaylistResponse.json()) as SpotifyPlaylistResponse;

    if (!playlist.id) {
      return jsonError("Spotify did not return a playlist ID", 502);
    }

    const addTracksResponse = await fetch(
      `${SPOTIFY_API_BASE_URL}/playlists/${encodeURIComponent(playlist.id)}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: trackUris }),
      }
    );

    if (!addTracksResponse.ok) {
      const message = await readSpotifyError(addTracksResponse);
      return jsonError("Failed to add tracks to Spotify playlist", addTracksResponse.status, message);
    }

    const spotifyUrl = playlist.external_urls?.spotify;

    if (!spotifyUrl) {
      return jsonError("Spotify did not return a playlist URL", 502);
    }

    return Response.json({ url: spotifyUrl });
  } catch (error) {
    console.error("Spotify playlist export failed", error);
    return jsonError("Unable to export playlist to Spotify", 500);
  }
}
