import YouTubeMusic from "youtube-music-ts-api";

export type YTMPrivacy = "PUBLIC" | "PRIVATE" | "UNLISTED";

export interface YTMTrackSearchPayload {
  title: string;
  artist: string;
}

export interface YTMPlaylistCreateResult {
  playlistId: string;
  name: string;
  description: string;
  privacy: string;
  addedTrackCount: number;
  warnings: string[];
}

const YTM_SEARCH_URL =
  "https://music.youtube.com/youtubei/v1/search?alt=json&key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";

function buildSearchBody(query: string) {
  return {
    query,
    context: {
      client: {
        hl: "en",
        gl: "US",
        clientName: "WEB_REMIX",
        clientVersion: "1.20241030.00.00-canary_experiment_1.20241028.01.00",
        musicAppInfo: {
          pwaInstallabilityStatus: "PWA_INSTALLABILITY_STATUS_UNKNOWN",
          webDisplayMode: "WEB_DISPLAY_MODE_BROWSER",
          storeDigitalGoodsApiSupportStatus: {
            playStoreDigitalGoodsApiSupportStatus: "DIGITAL_GOODS_API_UNSUPPORTED",
          },
        },
      },
    },
  };
}

function extractTextRuns(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  if (Array.isArray(input)) {
    return input.map((item) => extractTextRuns(item)).filter(Boolean).join("");
  }
  if (typeof input === "object") {
    if ("text" in input && typeof (input as any).text === "string") {
      return (input as any).text;
    }
    return Object.values(input)
      .map(extractTextRuns)
      .filter(Boolean)
      .join("");
  }
  return undefined;
}

function findTrackResult(payload: unknown): { videoId: string; title?: string } | null {
  if (!payload || typeof payload !== "object") return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const track = findTrackResult(item);
      if (track) return track;
    }
    return null;
  }

  const obj = payload as Record<string, unknown>;
  if (typeof obj.videoId === "string") {
    const title = extractTextRuns(obj.title ?? obj.name ?? obj.subtitle ?? obj.header);
    return { videoId: obj.videoId, title: title?.trim() || undefined };
  }

  for (const value of Object.values(obj)) {
    const track = findTrackResult(value);
    if (track) return track;
  }

  return null;
}

async function performYtmSearch(cookieString: string, query: string) {
  const response = await fetch(YTM_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieString,
      Origin: "https://music.youtube.com",
      Referer: "https://music.youtube.com/",
      "X-Goog-AuthUser": "0",
    },
    body: JSON.stringify(buildSearchBody(query)),
  });

  if (!response.ok) {
    throw new Error(`YouTube Music search failed: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const match = findTrackResult(json);
  if (!match) return null;
  return match;
}

export async function authenticateYtm(cookieString: string) {
  try {
    const ytm = new YouTubeMusic();
    const ytma = await ytm.authenticate(cookieString);
    if (!ytma) {
      throw new Error("Authentication returned null");
    }
    return ytma;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`YouTube Music authentication failed: ${msg}`);
  }
}

export async function createYTPlaylist(
  cookieString: string,
  playlistName: string,
  playlistDescription: string,
  privacy: YTMPrivacy = "PRIVATE"
) {
  try {
    const ytma = await authenticateYtm(cookieString);
    const playlist = await ytma.createPlaylist(playlistName, playlistDescription, privacy);
    if (!playlist?.id) {
      throw new Error("Playlist creation returned no ID");
    }
    return playlist;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create YouTube Music playlist: ${msg}`);
  }
}

export async function resolveTrackIds(
  cookieString: string,
  tracks: YTMTrackSearchPayload[]
) {
  const results: Array<{ track: YTMTrackSearchPayload; videoId: string }> = [];
  const warnings: string[] = [];

  for (const track of tracks) {
    const query = `${track.title} ${track.artist}`.trim();
    try {
      const match = await performYtmSearch(cookieString, query);
      if (match?.videoId) {
        results.push({ track, videoId: match.videoId });
      } else {
        warnings.push(`No match found for ${query}`);
      }
    } catch (error) {
      warnings.push(`Search failed for ${query}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { results, warnings };
}

export async function migrateTracksToYTPlaylist(
  cookieString: string,
  playlistName: string,
  playlistDescription: string,
  tracks: YTMTrackSearchPayload[],
  privacy: YTMPrivacy = "PRIVATE"
): Promise<YTMPlaylistCreateResult> {
  try {
    const playlist = await createYTPlaylist(cookieString, playlistName, playlistDescription, privacy);
    const { results, warnings } = await resolveTrackIds(cookieString, tracks);

    if (results.length > 0) {
      try {
        const ytma = await authenticateYtm(cookieString);
        const trackDetails = results.map(({ videoId }) => ({ id: videoId }));
        await ytma.addTracksToPlaylist(playlist.id!, ...trackDetails);
      } catch (addError) {
        warnings.push(`Failed to add tracks to playlist: ${addError instanceof Error ? addError.message : String(addError)}`);
      }
    }

    return {
      playlistId: playlist.id!,
      name: playlist.name ?? playlistName,
      description: playlistDescription,
      privacy,
      addedTrackCount: results.length,
      warnings,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(msg);
  }
}
