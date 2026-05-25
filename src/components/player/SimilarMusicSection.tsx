"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Music, Play, Sparkles } from "lucide-react";
import Image from "next/image";
import { PlayableTrack, usePlayerStore } from "@/store/player";
import { SpotifyTrack, artistNames, trackImage } from "@/types/spotify";
import { spotifyTrackIdFromUri } from "@/lib/spotify-track-id";

interface Props {
  track: PlayableTrack;
  compact?: boolean;
}

function toPlayable(t: SpotifyTrack): PlayableTrack {
  return {
    name: t.name,
    artist: artistNames(t),
    image: trackImage(t),
    uri: t.uri,
    durationMs: t.duration_ms,
  };
}

export default function SimilarMusicSection({ track, compact }: Props) {
  const [similarTracks, setSimilarTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();

  const fetchSimilar = useCallback(async () => {
    if (!track.name || !track.artist) {
      setSimilarTracks([]);
      setEmpty(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setEmpty(false);
    try {
      const params = new URLSearchParams({ limit: "15" });
      const trackId = spotifyTrackIdFromUri(track.uri);
      if (trackId) params.set("trackId", trackId);
      if (track.uri) params.set("trackUri", track.uri);
      params.set("track", track.name);
      params.set("artist", track.artist);

      const res = await fetch(`/api/spotify/recommendations?${params}`);
      const data = (await res.json().catch(() => ({}))) as {
        tracks?: SpotifyTrack[];
        error?: string;
      };

      if (!res.ok) {
        setSimilarTracks([]);
        setEmpty(true);
        return;
      }

      const currentUri = track.uri ?? "";
      const items = (data.tracks ?? []).filter(
        (item) => item?.uri && item.uri !== currentUri && item?.id
      );
      setSimilarTracks(items.slice(0, 12));
      setEmpty(items.length === 0);
    } catch {
      setSimilarTracks([]);
      setEmpty(true);
    } finally {
      setLoading(false);
    }
  }, [track.artist, track.name, track.uri]);

  useEffect(() => {
    void fetchSimilar();
  }, [fetchSimilar]);

  const playSimilar = (picked: SpotifyTrack) => {
    const playables = similarTracks.map(toPlayable);
    const index = similarTracks.findIndex((item) => item.id === picked.id);
    void setQueueAndPlay(playables, index >= 0 ? index : 0);
  };

  const isPlayingTrack = (item: SpotifyTrack) =>
    isPlaying &&
    currentTrack?.uri === item.uri &&
    currentTrack?.name === item.name;

  return (
    <section className={compact ? "space-y-2" : "space-y-3 pt-1 border-t border-white/[0.06]"}>
      <div className="flex items-center gap-2">
        <Sparkles size={compact ? 13 : 14} className="text-[#E8282B]" />
        <h3 className={`font-semibold text-white ${compact ? "text-xs" : "text-sm"}`}>
          Similar music
        </h3>
        {loading && <Loader2 size={12} className="animate-spin text-white/30" />}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-white/25" />
        </div>
      ) : empty ? (
        <p className="text-center text-sm text-white/30 py-8">
          No similar tracks found for this song
        </p>
      ) : (
        <div className={`flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide ${compact ? "" : "-mx-1 px-1"}`}>
          {similarTracks.map((item) => {
            const image = trackImage(item);
            const active = isPlayingTrack(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => playSimilar(item)}
                className={`shrink-0 flex flex-col items-center gap-1.5 text-left rounded-2xl p-2 transition-colors ${
                  active
                    ? "bg-[#E8282B]/15 ring-1 ring-[#E8282B]/30"
                    : "hover:bg-white/[0.06]"
                }`}
                style={{ width: compact ? 68 : 76 }}
              >
                <div
                  className="relative rounded-xl overflow-hidden bg-white/[0.06]"
                  style={{ width: compact ? 52 : 56, height: compact ? 52 : 56 }}
                >
                  {image ? (
                    <Image
                      src={image}
                      alt={item.name}
                      fill
                      unoptimized
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={16} className="text-white/20" />
                    </div>
                  )}
                  <div
                    className={`absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity ${
                      active ? "opacity-100" : "opacity-0 hover:opacity-100"
                    }`}
                  >
                    <Play size={14} fill="white" className="text-white ml-0.5" />
                  </div>
                </div>
                <p
                  className={`text-[10px] font-medium text-center truncate w-full leading-tight ${
                    active ? "text-[#E8282B]" : "text-white/80"
                  }`}
                >
                  {item.name}
                </p>
                <p className="text-[9px] text-white/35 text-center truncate w-full leading-tight">
                  {artistNames(item)}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
