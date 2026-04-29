"use client";

import { useEffect, useState } from "react";
import { SpotifyArtist, SpotifyTrack, artistImage } from "@/types/spotify";
import { X, Loader2, ExternalLink } from "lucide-react";
import Image from "next/image";
import SpotifyTrackCard from "./SpotifyTrackCard";
import { usePlayerStore, PlayableTrack } from "@/store/player";

interface Props {
  artist: SpotifyArtist;
  onClose: () => void;
}

function toPlayable(t: SpotifyTrack): PlayableTrack {
  return {
    name: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    image: t.album?.images?.[0]?.url,
    uri: t.uri,
    durationMs: t.duration_ms,
  };
}

export default function ArtistSheet({ artist, onClose }: Props) {
  const [info, setInfo] = useState<SpotifyArtist | null>(null);
  const [topTracks, setTopTracks] = useState<SpotifyTrack[]>([]);
  const [moreTracks, setMoreTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const { setQueueAndPlay } = usePlayerStore();

  useEffect(() => {
    fetch(`/api/spotify/artist?id=${encodeURIComponent(artist.id)}&name=${encodeURIComponent(artist.name)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => {
        setInfo(d.info ?? null);
        setTopTracks(d.topTracks ?? []);
        setMoreTracks(d.moreTracks ?? []);
      })
      .catch((e) => console.error("ArtistSheet fetch failed:", e))
      .finally(() => setLoading(false));
  }, [artist.id]);

  const image = artistImage(info ?? artist);
  const allTracks = [...topTracks, ...moreTracks];

  const handlePlay = (track: SpotifyTrack) => {
    const index = allTracks.findIndex((t) => t.id === track.id);
    if (index === -1) return;
    setQueueAndPlay(allTracks.map(toPlayable), index);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-zinc-800 shadow-2xl">
        <div className="flex items-start gap-4 p-5 border-b border-zinc-800 shrink-0">
          <div className="relative w-16 h-16 shrink-0">
            {image ? (
              <Image src={image} alt={artist.name} fill unoptimized className="rounded-full object-cover" sizes="64px" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-zinc-800" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white">{artist.name}</h2>
            {(info ?? artist).followers?.total != null && (
              <p className="text-zinc-400 text-sm">
                {((info ?? artist).followers.total).toLocaleString()} followers
              </p>
            )}
            {(info ?? artist).genres?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(info ?? artist).genres.slice(0, 4).map((g) => (
                  <span key={g} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full capitalize">
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={(info ?? artist).external_urls.spotify}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Open on Spotify"
            >
              <ExternalLink size={16} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-zinc-500" />
            </div>
          ) : (
            <>
              {topTracks.length > 0 && (
                <section>
                  <h3 className="text-white font-semibold mb-2">Top Tracks</h3>
                  <div className="space-y-1">
                    {topTracks.map((t, i) => (
                      <SpotifyTrackCard key={t.id} track={t} rank={i + 1} onPlay={handlePlay} />
                    ))}
                  </div>
                </section>
              )}

              {moreTracks.length > 0 && (
                <section>
                  <h3 className="text-white font-semibold mb-2">More Songs</h3>
                  <div className="space-y-1">
                    {moreTracks.map((t, i) => (
                      <SpotifyTrackCard key={t.id} track={t} rank={topTracks.length + i + 1} onPlay={handlePlay} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
