import { auth } from "@/lib/auth";
import { SPOTIFY_PLAYLIST_WRITE_SCOPES } from "@/lib/spotify-scopes";

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

function jsonError(error: string, status: number, message?: string) {
  return Response.json({ error, ...(message ? { message } : {}) }, { status });
}

function spotifyErrorResponse(error: string, status: number, errorBody: string) {
  return Response.json(
    {
      error,
      message: errorBody || `Spotify API returned ${status}`,
      reauthRequired: status === 401 || status === 403,
    },
    { status }
  );
}

async function readSpotifyErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return response.statusText;
  }
}

function hasPlaylistWriteScopes(scope?: string) {
  const grantedScopes = new Set(scope?.split(/\s+/).filter(Boolean));
  return SPOTIFY_PLAYLIST_WRITE_SCOPES.every((requiredScope) => grantedScopes.has(requiredScope));
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.accessToken || !session?.spotifyId) {
    return jsonError("Unauthorized", 401);
  }

  if (!hasPlaylistWriteScopes(session.spotifyScope)) {
    console.warn(
      "Spotify playlist export running without confirmed playlist write scopes:",
      session.spotifyScope ?? "(no scopes on session)"
    );
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
    const createPlaylistUrl = `${SPOTIFY_API_BASE_URL}/users/${session.spotifyId}/playlists`;
    const createPlaylistBody = {
      name,
      description: "Exported from Jokerly",
      public: false,
      collaborative: false,
    };

    const createPlaylistResponse = await fetch(
      createPlaylistUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPlaylistBody),
        cache: "no-store",
      }
    );

    if (!createPlaylistResponse.ok) {
      const errorBody = await readSpotifyErrorBody(createPlaylistResponse);
      console.error("Spotify API Error Details:", createPlaylistResponse.status, errorBody);
      return spotifyErrorResponse("Failed to create Spotify playlist", createPlaylistResponse.status, errorBody);
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
        cache: "no-store",
      }
    );

    if (!addTracksResponse.ok) {
      const errorBody = await readSpotifyErrorBody(addTracksResponse);
      console.error("Spotify API Error Details:", addTracksResponse.status, errorBody);
      return spotifyErrorResponse("Failed to add tracks to Spotify playlist", addTracksResponse.status, errorBody);
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
