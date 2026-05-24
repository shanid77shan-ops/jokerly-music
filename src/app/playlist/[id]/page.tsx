import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

type PublicPlaylistPageProps = {
  params: Promise<{ id: string }>;
};

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
};

type PlaylistTrackRow = {
  id: string;
  track_uri: string;
  track_name: string;
  track_image: string | null;
  track_artist: string | null;
  position: number | null;
};

function spotifyTrackUrl(uri: string) {
  const prefix = "spotify:track:";
  const trackId = uri.startsWith(prefix) ? uri.slice(prefix.length) : uri;
  return /^[A-Za-z0-9]{22}$/.test(trackId) ? `https://open.spotify.com/track/${trackId}` : null;
}

async function getPublicPlaylist(id: string) {
  const supabase = await createClient();

  const { data: playlist, error: playlistError } = await supabase
    .from("playlists")
    .select("id, name, description, image")
    .eq("id", id)
    .single<PlaylistRow>();

  if (playlistError || !playlist) return null;

  const { data: tracks, error: tracksError } = await supabase
    .from("playlist_tracks")
    .select("id, track_uri, track_name, track_image, track_artist, position")
    .eq("playlist_id", id)
    .order("position", { ascending: true })
    .order("added_at", { ascending: true })
    .returns<PlaylistTrackRow[]>();

  if (tracksError) return { playlist, tracks: [] };

  return { playlist, tracks: tracks ?? [] };
}

export async function generateMetadata({ params }: PublicPlaylistPageProps) {
  const { id } = await params;
  const result = await getPublicPlaylist(id);

  if (!result) {
    return {
      title: "Playlist not found | Jokerly",
    };
  }

  return {
    title: `${result.playlist.name} | Jokerly`,
    description: result.playlist.description || `${result.tracks.length} tracks shared from Jokerly`,
  };
}

export default async function PublicPlaylistPage({ params }: PublicPlaylistPageProps) {
  const { id } = await params;
  const result = await getPublicPlaylist(id);

  if (!result) notFound();

  const { playlist, tracks } = result;
  const coverImages = [...new Set(tracks.map((track) => track.track_image).filter(Boolean) as string[])].slice(0, 4);

  return (
    <main className="min-h-screen px-4 py-8" style={{ background: "#080406", color: "white" }}>
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex items-end gap-4">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-white/[0.06] shadow-xl">
            {playlist.image ? (
              <Image src={playlist.image} alt={playlist.name} fill unoptimized sizes="112px" className="object-cover" />
            ) : coverImages.length > 1 ? (
              <div className="grid h-full w-full grid-cols-2">
                {[...coverImages, ...Array(4).fill(null)].slice(0, 4).map((image, index) => (
                  <div key={index} className="relative bg-white/[0.04]">
                    {image && <Image src={image} alt="" fill unoptimized sizes="56px" className="object-cover" />}
                  </div>
                ))}
              </div>
            ) : coverImages[0] ? (
              <Image src={coverImages[0]} alt={playlist.name} fill unoptimized sizes="112px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl">♪</div>
            )}
          </div>
          <div className="min-w-0 pb-1">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/35">Jokerly Playlist</p>
            <h1 className="mt-1 truncate text-3xl font-black tracking-tight">{playlist.name}</h1>
            {playlist.description && <p className="mt-2 text-sm text-white/55">{playlist.description}</p>}
            <p className="mt-2 text-sm text-white/40">{tracks.length} tracks</p>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          {tracks.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-white/45">No tracks in this playlist yet.</p>
          ) : (
            <ol className="divide-y divide-white/[0.06]">
              {tracks.map((track, index) => {
                const spotifyUrl = spotifyTrackUrl(track.track_uri);

                return (
                  <li key={track.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-white/30">{index + 1}</span>
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/[0.06]">
                      {track.track_image ? (
                        <Image src={track.track_image} alt="" fill unoptimized sizes="44px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      {spotifyUrl ? (
                        <a href={spotifyUrl} className="block truncate text-sm font-semibold text-white hover:text-[#E8282B]">
                          {track.track_name}
                        </a>
                      ) : (
                        <p className="truncate text-sm font-semibold text-white">{track.track_name}</p>
                      )}
                      {track.track_artist && <p className="mt-0.5 truncate text-xs text-white/45">{track.track_artist}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <p className="text-center text-xs text-white/25">Shared from Jokerly</p>
      </div>
    </main>
  );
}
