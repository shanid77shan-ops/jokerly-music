import type { SupabaseClient } from "@supabase/supabase-js";



const SPOTIFY_API = "https://api.spotify.com/v1";



export type CompileArtist = { id: string; name: string };



type SpotifyTrack = {

  id?: string;

  uri?: string;

  name?: string;

  album?: { images?: { url: string }[] };

  artists?: { id?: string; name: string }[];

};



export function parseSelectedArtists(value: unknown): CompileArtist[] {

  if (!Array.isArray(value)) return [];

  return value.filter(

    (artist): artist is CompileArtist =>

      typeof artist === "object" &&

      artist !== null &&

      typeof (artist as CompileArtist).id === "string" &&

      typeof (artist as CompileArtist).name === "string"

  );

}



class SpotifyAuthError extends Error {

  constructor() {

    super("Session expired — please log in again");

    this.name = "SpotifyAuthError";

  }

}



async function spotifyGet(url: string, token: string): Promise<unknown | null> {

  try {

    const response = await fetch(url, {

      headers: { Authorization: `Bearer ${token}` },

      signal: AbortSignal.timeout(8000),

    });

    if (response.status === 401) throw new SpotifyAuthError();

    if (!response.ok) return null;

    return response.json();

  } catch (error) {

    if (error instanceof SpotifyAuthError) throw error;

    return null;

  }

}



async function fetchTopTracks(artistId: string, token: string): Promise<SpotifyTrack[]> {

  const noMarket = (await spotifyGet(`${SPOTIFY_API}/artists/${artistId}/top-tracks`, token)) as {

    tracks?: SpotifyTrack[];

  } | null;

  if (noMarket?.tracks?.length) return noMarket.tracks;



  const usMarket = (await spotifyGet(

    `${SPOTIFY_API}/artists/${artistId}/top-tracks?market=US`,

    token

  )) as { tracks?: SpotifyTrack[] } | null;

  return usMarket?.tracks ?? [];

}



async function searchAllTracks(name: string, artistId: string, token: string): Promise<SpotifyTrack[]> {

  const queries = [`artist:"${name}"`, `artist:${name}`, name];

  const pages = await Promise.allSettled(

    queries.map((query) =>

      spotifyGet(

        `${SPOTIFY_API}/search?q=${encodeURIComponent(query)}&type=track&limit=50`,

        token

      ).then((data) => (data as { tracks?: { items?: SpotifyTrack[] } } | null)?.tracks?.items ?? [])

    )

  );



  const seen = new Set<string>();

  const result: SpotifyTrack[] = [];



  for (const page of pages) {

    if (page.status !== "fulfilled") continue;

    for (const track of page.value) {

      if (!track?.id || seen.has(track.id)) continue;

      seen.add(track.id);

      result.push(track);

    }

  }



  return result.sort((a, b) => {

    const aDirect = a.artists?.some((artist) => artist.id === artistId) ? 0 : 1;

    const bDirect = b.artists?.some((artist) => artist.id === artistId) ? 0 : 1;

    return aDirect - bDirect;

  });

}



async function fetchAlbumTracks(artistId: string, token: string): Promise<SpotifyTrack[]> {

  const albums = (await spotifyGet(

    `${SPOTIFY_API}/artists/${artistId}/albums?include_groups=album,single&limit=10`,

    token

  )) as { items?: { id: string; name: string; images?: { url: string }[] }[] } | null;

  const items = albums?.items ?? [];

  if (!items.length) return [];



  const tracks: SpotifyTrack[] = [];

  for (const album of items.slice(0, 5)) {

    const albumData = (await spotifyGet(

      `${SPOTIFY_API}/albums/${album.id}/tracks?limit=50`,

      token

    )) as { items?: SpotifyTrack[] } | null;

    const albumTracks = albumData?.items ?? [];

    for (const track of albumTracks) {

      tracks.push({

        ...track,

        album: track.album ?? { images: album.images },

      });

    }

    if (tracks.length >= 50) break;

  }



  return tracks;

}



async function fetchArtistTracks(artist: CompileArtist, token: string): Promise<SpotifyTrack[]> {

  const topTracks = await fetchTopTracks(artist.id, token);

  const seen = new Set<string>();

  const merged: SpotifyTrack[] = [];



  const addTrack = (track: SpotifyTrack) => {

    const key = track.id ?? track.uri;

    if (!key || !track.uri || seen.has(key)) return;

    seen.add(key);

    merged.push(track);

  };



  for (const track of topTracks) addTrack(track);



  if (merged.length < 10) {

    for (const track of await fetchAlbumTracks(artist.id, token)) {

      addTrack(track);

      if (merged.length >= 20) break;

    }

  }



  if (merged.length < 10) {

    for (const track of await searchAllTracks(artist.name, artist.id, token)) {

      addTrack(track);

      if (merged.length >= 20) break;

    }

  }



  return merged;

}



export async function compilePlaylist(

  token: string,

  playlistId: string,

  userId: string,

  selectedArtists: CompileArtist[],

  supabase: SupabaseClient

): Promise<{ addedCount: number }> {

  const seenUris = new Set<string>();

  const tracksByArtist: { uri: string; name: string; image: string | null; artist: string }[][] = [];



  for (const artist of selectedArtists) {

    const tracks = await fetchArtistTracks(artist, token);

    const artistTracks: { uri: string; name: string; image: string | null; artist: string }[] = [];



    for (const track of tracks.slice(0, 10)) {

      if (!track.uri || seenUris.has(track.uri)) continue;

      seenUris.add(track.uri);

      artistTracks.push({

        uri: track.uri,

        name: track.name ?? "Track",

        image: track.album?.images?.[0]?.url ?? null,

        artist: track.artists?.map((a) => a.name).join(", ") ?? artist.name,

      });

    }



    if (artistTracks.length > 0) tracksByArtist.push(artistTracks);

  }



  const allTracks: { uri: string; name: string; image: string | null; artist: string }[] = [];

  let index = 0;

  while (tracksByArtist.some((list) => index < list.length)) {

    for (const list of tracksByArtist) {

      if (index < list.length) allTracks.push(list[index]);

    }

    index += 1;

  }



  if (allTracks.length === 0) return { addedCount: 0 };



  const { count } = await supabase

    .from("playlist_tracks")

    .select("id", { count: "exact", head: true })

    .eq("playlist_id", playlistId)

    .eq("user_id", userId);



  const rows = allTracks.map((track, index) => ({

    user_id: userId,

    playlist_id: playlistId,

    track_uri: track.uri,

    track_name: track.name,

    track_image: track.image,

    track_artist: track.artist,

    position: (count ?? 0) + index + 1,

  }));



  const { error } = await supabase.from("playlist_tracks").insert(rows);

  if (error) throw new Error(error.message);



  return { addedCount: rows.length };

}


