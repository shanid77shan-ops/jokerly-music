import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth, refreshAccessToken } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const SPOTIFY_BASE = "https://api.spotify.com/v1";

type TransferAction = "liked" | "playlist";

interface TransferBody {
  action?: TransferAction;
  playlistId?: string;
  public?: boolean;
}

interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
}

interface PlaylistTrackRow {
  track_uri: string;
}

interface LikedSongRow {
  track_uri: string;
}

interface LikedArtistRow {
  artist_id: string;
}

class SpotifyApiError extends Error {
  constructor(public status: number, message: string, public details?: string) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function spotifyIdFromUri(uri: string, expectedType: "track" | "artist") {
  const prefix = `spotify:${expectedType}:`;
  return uri.startsWith(prefix) ? uri.slice(prefix.length) : uri;
}

function isSpotifyTrackUri(uri: string) {
  return /^spotify:track:[A-Za-z0-9]{22}$/.test(uri);
}

function spotifyErrorMessage(status: number, details: string) {
  const lower = details.toLowerCase();
  if (status === 401 || status === 403 || lower.includes("scope") || lower.includes("permission")) {
    return "Spotify needs a one-time permission upgrade. Tap Continue with Spotify, approve it, then retry transfer.";
  }
  return details || `Spotify API ${status}`;
}

function errorStatus(error: unknown) {
  if (error instanceof SpotifyApiError && (error.status === 401 || error.status === 403)) return 401;
  if (error instanceof SpotifyApiError && error.status >= 400 && error.status < 500) return 400;
  return 502;
}

function bearerTokenFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

async function spotifyRequest<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`${SPOTIFY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new SpotifyApiError(res.status, spotifyErrorMessage(res.status, details), details);
  }

  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

async function getRefreshedAccessToken(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  });

  if (!token) return null;
  const refreshed = await refreshAccessToken(token);
  if (refreshed.error || !refreshed.accessToken) return null;
  return refreshed.accessToken;
}

async function retryWithFreshToken<T>(
  req: NextRequest,
  accessToken: string,
  action: (token: string) => Promise<T>
) {
  try {
    return await action(accessToken);
  } catch (error) {
    if (!(error instanceof SpotifyApiError) || error.status !== 401) throw error;

    const freshToken = await getRefreshedAccessToken(req);
    if (!freshToken || freshToken === accessToken) throw error;
    return action(freshToken);
  }
}

async function saveLikedSongs(accessToken: string, songs: LikedSongRow[]) {
  const trackIds = uniqueValues(songs.map((song) => spotifyIdFromUri(song.track_uri, "track")));
  for (const ids of chunk(trackIds, 50)) {
    await spotifyRequest("/me/tracks", accessToken, {
      method: "PUT",
      body: JSON.stringify({ ids }),
    });
  }
  return trackIds.length;
}

async function followLikedArtists(accessToken: string, artists: LikedArtistRow[]) {
  const artistIds = uniqueValues(artists.map((artist) => spotifyIdFromUri(artist.artist_id, "artist")));
  for (const ids of chunk(artistIds, 50)) {
    await spotifyRequest(`/me/following?type=artist&ids=${encodeURIComponent(ids.join(","))}`, accessToken, {
      method: "PUT",
    });
  }
  return artistIds.length;
}

async function createSpotifyPlaylist(
  accessToken: string,
  playlist: PlaylistRow,
  tracks: PlaylistTrackRow[],
  isPublic: boolean
) {
  const profile = await spotifyRequest<{ id: string }>("/me", accessToken);
  const created = await spotifyRequest<{ id: string; external_urls?: { spotify?: string } }>(
    `/users/${encodeURIComponent(profile.id)}/playlists`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: playlist.name,
        description: playlist.description || "Transferred from Jokerly Music",
        public: isPublic,
      }),
    }
  );

  const allUris = tracks.map((track) => track.track_uri).filter(Boolean);
  const uris = uniqueValues(allUris.filter(isSpotifyTrackUri));
  const skippedCount = allUris.length - uris.length;
  if (uris.length === 0) throw new SpotifyApiError(400, "This playlist has no valid Spotify track URIs to transfer.");

  for (const batch of chunk(uris, 100)) {
    await spotifyRequest(`/playlists/${encodeURIComponent(created.id)}/tracks`, accessToken, {
      method: "POST",
      body: JSON.stringify({ uris: batch }),
    });
  }

  return {
    spotifyPlaylistId: created.id,
    spotifyPlaylistUrl: created.external_urls?.spotify ?? null,
    trackCount: uris.length,
    skippedCount,
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken || !session.spotifyId || session.error) {
    return NextResponse.json({ error: "Spotify sign-in required" }, { status: 401 });
  }

  const spotifyAccessToken = bearerTokenFromRequest(req) ?? session.accessToken;
  const body = (await req.json()) as TransferBody;
  const supabase = await createClient();

  if (body.action === "liked") {
    const [songsResult, artistsResult] = await Promise.all([
      supabase.from("liked_songs").select("track_uri").eq("user_id", session.spotifyId).order("liked_at", { ascending: false }),
      supabase.from("liked_artists").select("artist_id").eq("user_id", session.spotifyId).order("liked_at", { ascending: false }),
    ]);

    if (songsResult.error) return NextResponse.json({ error: songsResult.error.message }, { status: 500 });
    if (artistsResult.error) return NextResponse.json({ error: artistsResult.error.message }, { status: 500 });

    const warnings: string[] = [];
    let savedSongCount = 0;
    let followedArtistCount = 0;

    try {
      savedSongCount = await retryWithFreshToken(req, spotifyAccessToken, (token) =>
        saveLikedSongs(token, (songsResult.data ?? []) as LikedSongRow[])
      );
    } catch (error) {
      console.error("[spotify-transfer] liked songs transfer failed", error);
      if (error instanceof SpotifyApiError && (error.status === 401 || error.status === 403)) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      warnings.push(`Liked songs were not saved: ${(error as Error).message}`);
    }

    try {
      followedArtistCount = await retryWithFreshToken(req, spotifyAccessToken, (token) =>
        followLikedArtists(token, (artistsResult.data ?? []) as LikedArtistRow[])
      );
    } catch (error) {
      console.error("[spotify-transfer] liked artists transfer failed", error);
      if (savedSongCount === 0 && error instanceof SpotifyApiError && (error.status === 401 || error.status === 403)) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      warnings.push(`Liked artists were not followed: ${(error as Error).message}`);
    }

    return NextResponse.json({ ok: warnings.length === 0, savedSongCount, followedArtistCount, warnings });
  }

  if (body.action === "playlist") {
    if (!body.playlistId) return NextResponse.json({ error: "Playlist id required" }, { status: 400 });

    const [playlistResult, tracksResult] = await Promise.all([
      supabase.from("playlists").select("id, name, description").eq("id", body.playlistId).eq("user_id", session.spotifyId).single(),
      supabase.from("playlist_tracks").select("track_uri").eq("playlist_id", body.playlistId).eq("user_id", session.spotifyId).order("position", { ascending: true }),
    ]);

    if (playlistResult.error) return NextResponse.json({ error: playlistResult.error.message }, { status: 500 });
    if (tracksResult.error) return NextResponse.json({ error: tracksResult.error.message }, { status: 500 });

    const tracks = (tracksResult.data ?? []) as PlaylistTrackRow[];
    if (tracks.length === 0) return NextResponse.json({ error: "Playlist has no tracks to transfer" }, { status: 400 });

    try {
      const created = await retryWithFreshToken(req, spotifyAccessToken, (token) =>
        createSpotifyPlaylist(token, playlistResult.data as PlaylistRow, tracks, body.public ?? false)
      );
      return NextResponse.json({ ok: true, ...created });
    } catch (error) {
      console.error("[spotify-transfer] playlist transfer failed", error);
      return NextResponse.json({ error: (error as Error).message }, { status: errorStatus(error) });
    }
  }

  return NextResponse.json({ error: "Unsupported transfer action" }, { status: 400 });
}
