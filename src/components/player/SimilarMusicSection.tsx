"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Music, Play, RefreshCw, Sparkles } from "lucide-react";
import Image from "next/image";
import { PlayableTrack, usePlayerStore } from "@/store/player";
import { SpotifyTrack, artistNames, trackImage } from "@/types/spotify";
import { spotifyTrackIdFromUri } from "@/lib/spotify-track-id";
const BATCH_SIZE = 5;

interface Props {
  track: PlayableTrack;
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

export default function SimilarMusicSection({ track }: Props) {
  const [similarTracks, setSimilarTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [canRefresh, setCanRefresh] = useState(true);
  const [hiddenCount, setHiddenCount] = useState(0);
  const refreshSeedRef = useRef(0);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const trackKeyRef = useRef("");
  const fetchGenRef = useRef(0);
  const playingRef = useRef(false);
  const { setQueueAndPlay, currentTrack, isPlaying } = usePlayerStore();

  const loadBatch = useCallback(
    async (isRefresh: boolean) => {
      const generation = ++fetchGenRef.current;

      if (!track.name || !track.artist) {
        setSimilarTracks([]);
        setEmpty(true);
        setCanRefresh(false);
        return;
      }

      if (isRefresh) {
        refreshSeedRef.current += 1;
        setRefreshing(true);
      } else {
        refreshSeedRef.current = 0;
        setLoading(true);
      }

      setEmpty(false);
      try {
        const params = new URLSearchParams({
          limit: String(BATCH_SIZE),
          refresh: String(refreshSeedRef.current),
        });
        const trackId = spotifyTrackIdFromUri(track.uri);
        if (trackId) params.set("trackId", trackId);
        if (track.uri) params.set("trackUri", track.uri);
        params.set("track", track.name);
        params.set("artist", track.artist);

        const exclude = Array.from(shownIdsRef.current);
        if (exclude.length > 0) params.set("exclude", exclude.join(","));

        const res = await fetch(`/api/spotify/recommendations?${params}`);
        if (generation !== fetchGenRef.current) return;

        const data = (await res.json().catch(() => ({}))) as {
          tracks?: SpotifyTrack[];
          error?: string;
        };

        if (!res.ok) {
          setSimilarTracks([]);
          setEmpty(true);
          setCanRefresh(false);
          return;
        }

        const currentUri = track.uri ?? "";
        const items = (data.tracks ?? []).filter(
          (item) =>
            item?.uri &&
            item?.id &&
            item.uri !== currentUri &&
            !shownIdsRef.current.has(item.id)
        );

        const batch = items.slice(0, BATCH_SIZE);
        for (const item of batch) shownIdsRef.current.add(item.id);

        if (generation !== fetchGenRef.current) return;

        setSimilarTracks(batch);
        setEmpty(batch.length === 0);
        setHiddenCount(Math.max(0, shownIdsRef.current.size - batch.length));
        setCanRefresh(batch.length > 0);
      } catch {
        if (generation !== fetchGenRef.current) return;
        setSimilarTracks([]);
        setEmpty(true);
        setCanRefresh(false);
      } finally {
        if (generation !== fetchGenRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [track.artist, track.name, track.uri]
  );
  useEffect(() => {
    return () => {
      fetchGenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const key = `${track.uri ?? ""}::${track.name}::${track.artist}`;
    if (trackKeyRef.current === key) return;
    trackKeyRef.current = key;
    shownIdsRef.current = new Set();
    refreshSeedRef.current = 0;
    setHiddenCount(0);
    void loadBatch(false);
  }, [track.artist, track.name, track.uri, loadBatch]);

  const handleRefresh = () => {
    if (refreshing || !canRefresh) return;
    void loadBatch(true);
  };

  const playSimilar = async (picked: SpotifyTrack) => {
    if (playingRef.current) return;
    const playables = similarTracks.map(toPlayable).filter((item) => item.uri);
    if (playables.length === 0) return;

    playingRef.current = true;
    try {
      const index = playables.findIndex(
        (item) => item.uri === picked.uri || item.name === picked.name
      );
      await setQueueAndPlay(playables, index >= 0 ? index : 0);
      window.requestAnimationFrame(() => {
        usePlayerStore.setState({ isQueueOpen: false });
      });
    } finally {
      window.setTimeout(() => {
        playingRef.current = false;
      }, 300);
    }
  };
  const isPlayingTrack = (item: SpotifyTrack) =>
    isPlaying &&
    currentTrack?.uri === item.uri &&
    currentTrack?.name === item.name;

  const busy = loading || refreshing;

  return (
    <section className="flex flex-col min-h-0 flex-1 space-y-3">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={15} className="text-[#E8282B] shrink-0" />
          <div className="min-w-0">
            <h3 className="font-bold text-white text-base">Similar music</h3>
            <p className="text-[11px] text-white/35 truncate">
              Like {track.name}
            </p>
          </div>
        </div>
        {busy && <Loader2 size={14} className="animate-spin text-white/30 shrink-0" />}
      </div>

      <div
        className="flex-1 min-h-[280px] rounded-2xl border overflow-hidden flex flex-col"
        style={{ background: "var(--card)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-white/25" />
          </div>
        ) : empty ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-4 gap-2">
            <Music size={28} className="text-white/15" />
            <p className="text-sm text-white/35 text-center">No similar tracks found</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {similarTracks.map((item, index) => {
              const image = trackImage(item);
              const active = isPlayingTrack(item);
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void playSimilar(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void playSimilar(item);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left border-b transition-colors last:border-b-0 cursor-pointer ${
                    active
                      ? "bg-[#E8282B]/12 border-[#E8282B]/15"
                      : "border-white/[0.05] hover:bg-white/[0.04]"
                  }`}
                >
                  <span
                    className={`text-xs w-5 text-right shrink-0 tabular-nums font-medium ${
                      active ? "text-[#E8282B]" : "text-white/25"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/[0.06]">
                    {image ? (
                      <Image
                        src={image}
                        alt={item.name}
                        fill
                        unoptimized
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music size={18} className="text-white/20" />
                      </div>
                    )}
                    <div
                      className={`absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity ${
                        active ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <Play size={14} fill="white" className="text-white ml-0.5" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold truncate leading-tight ${
                        active ? "text-[#E8282B]" : "text-white"
                      }`}
                    >
                      {item.name}
                    </p>
                    <p className="text-xs text-white/40 truncate mt-0.5">{artistNames(item)}</p>
                  </div>
                </div>
              );
            })}          </div>
        )}

        <div className="shrink-0 p-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={busy || empty || !canRefresh}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] disabled:opacity-40 text-white/80 hover:text-white text-sm font-semibold transition-colors"
          >
            {refreshing ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Loading more…
              </>
            ) : (
              <>
                <RefreshCw size={16} /> Show 5 different tracks
              </>
            )}
          </button>
          {hiddenCount > 0 && (
            <p className="text-[10px] text-white/25 text-center mt-2">
              {hiddenCount} earlier track{hiddenCount === 1 ? "" : "s"} won&apos;t appear again
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
