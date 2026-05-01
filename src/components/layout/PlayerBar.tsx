"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { usePlayerStore } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, X, Music, Repeat, Repeat1, Shuffle, ChevronDown, ListPlus, Loader2 } from "lucide-react";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";

function formatTime(seconds: number) {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Client-side resolve cache so the same track never hits the API twice
const resolveCache = new Map<string, { uri: string | null; imageUrl?: string | null; durationMs?: number }>();

export default function PlayerBar() {
  const { data: session } = useSession();
  const {
    currentTrack,
    queue,
    queueIndex,
    pendingIndex,
    isPlaying,
    isTransitioning,
    progressMs,
    durationMs,
    isPlayerReady,
    sdkError,
    repeatMode,
    shuffleEnabled,
    endedToken,
    isPlayerExpanded: expanded,
    initializePlayer,
    togglePlay,
    playIndex,
    updateTrackUri,
    seek,
    stop,
    setRepeatMode,
    toggleShuffle,
    getNextIndex,
    getPrevIndex,
  } = usePlayerStore();

  const [fetching, setFetching] = useState(false);
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const [resolvingAdd, setResolvingAdd] = useState(false);
  const fetchingRef = useRef(false);

  const handleAddToPlaylist = useCallback(async () => {
    if (!currentTrack) return;
    if (currentTrack.uri) {
      setModalTrack({ name: currentTrack.name, uri: currentTrack.uri, image: currentTrack.image, artist: currentTrack.artist });
      return;
    }
    setResolvingAdd(true);
    try {
      const cacheKey = `${currentTrack.name}::${currentTrack.artist}`;
      const cached = resolveCache.get(cacheKey);
      if (cached?.uri) {
        setModalTrack({ name: currentTrack.name, uri: cached.uri });
        return;
      }
      const res = await fetch(
        `/api/spotify/resolve?track=${encodeURIComponent(currentTrack.name)}&artist=${encodeURIComponent(currentTrack.artist)}`
      );
      const data = await res.json();
      if (data.uri) {
        resolveCache.set(cacheKey, data);
        setModalTrack({ name: currentTrack.name, uri: data.uri });
      }
    } finally {
      setResolvingAdd(false);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!session?.accessToken) return;
    initializePlayer(session.accessToken);
  }, [session?.accessToken, initializePlayer]);

  const fetchAndPlay = useCallback(async (index: number) => {
    if (index < 0 || index >= queue.length || fetchingRef.current) return;
    const track = queue[index];

    if (track.uri !== undefined) {
      playIndex(index);
      return;
    }

    // Check client-side cache first
    const cacheKey = `${track.name}::${track.artist}`;
    const cached = resolveCache.get(cacheKey);
    if (cached !== undefined) {
      updateTrackUri(index, cached.uri, cached.imageUrl, cached.durationMs);
      usePlayerStore.getState().playIndex(index);
      return;
    }

    fetchingRef.current = true;
    setFetching(true);
    try {
      const res = await fetch(
        `/api/spotify/resolve?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`
      );
      const data = await res.json();
      resolveCache.set(cacheKey, data);
      updateTrackUri(index, data.uri ?? null, data.imageUrl, data.durationMs ?? undefined);
      usePlayerStore.getState().playIndex(index);
    } finally {
      fetchingRef.current = false;
      setFetching(false);
    }
  }, [queue, playIndex, updateTrackUri]);

  useEffect(() => {
    if (!endedToken) return;
    const nextIndex = getNextIndex();
    if (nextIndex === null) return;
    fetchAndPlay(nextIndex);
  }, [endedToken, fetchAndPlay, getNextIndex]);

  if (sdkError && !currentTrack) {
    return (
      <div className="fixed bottom-16 sm:bottom-0 left-0 right-0 z-40 border-t border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: "rgba(7,5,18,0.97)", backdropFilter: "blur(20px)" }}>
        <p className="text-[#E8282B] text-sm truncate">{sdkError}</p>
        {sdkError.includes("Premium") || sdkError.includes("auth") ? null : (
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 text-xs bg-[#E8282B] text-white px-3 py-1.5 rounded-xl font-medium">
            Re-login
          </button>
        )}
      </div>
    );
  }

  if (!currentTrack) return null;

  const prevIndex = getPrevIndex();
  const nextIndex = getNextIndex();
  const progressRatio = durationMs > 0 ? Math.min(progressMs / durationMs, 1) : 0;
  const noTrackUri = currentTrack.uri === null;
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;
  const pendingTrack = pendingIndex !== null ? queue[pendingIndex] ?? null : null;

  // Play button state
  const playBusy = (!currentTrack || !isPlaying) && (fetching || isTransitioning || (!isPlayerReady && !sdkError));
  const playDisabled = noTrackUri || playBusy;

  const cycleRepeatMode = () => {
    if (repeatMode === "off") { setRepeatMode("all"); return; }
    if (repeatMode === "all") { setRepeatMode("one"); return; }
    setRepeatMode("off");
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek((e.clientX - rect.left) / rect.width);
  };

  return (
    <>
      {/* ── Expanded Now Playing ── */}
      {expanded && (
        <div className="fixed inset-0 z-50 p-4 sm:p-6 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(6,4,16,0.96)", backdropFilter: "blur(28px)" }}
          onClick={() => usePlayerStore.setState({ isPlayerExpanded: false })}>
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-3xl border border-white/[0.08] p-5 shadow-2xl shadow-black/80"
              style={{ background: "var(--surface)" }}>
              <div className="mb-5 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">Now Playing</p>
                <button onClick={() => usePlayerStore.setState({ isPlayerExpanded: false })}
                  className="rounded-xl p-2 text-white/30 hover:bg-white/[0.07] hover:text-white transition-colors">
                  <ChevronDown size={18} />
                </button>
              </div>

              <div className="space-y-5">
                {/* Album art */}
                <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-3xl shadow-2xl shadow-black/60"
                  style={{ background: "var(--card)" }}>
                  {currentTrack.image ? (
                    <Image src={currentTrack.image} alt={currentTrack.name} fill unoptimized className="object-cover" sizes="400px" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Music size={56} className="text-white/10" />
                    </div>
                  )}
                </div>

                {/* Title */}
                <div className="min-w-0 text-center">
                  <p className="truncate text-xl font-bold text-white">{currentTrack.name}</p>
                  <p className="mt-0.5 truncate text-sm text-white/40">{currentTrack.artist}</p>
                </div>

                {/* Switching indicator */}
                {(isTransitioning || (playBusy && !noTrackUri)) && (
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-white/25">Up Next</p>
                      <p className="text-sm text-white truncate">{pendingTrack?.name ?? currentTrack.name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Loader2 size={13} className="animate-spin text-white/30" />
                      <span className="text-xs text-white/30">
                        {fetching ? "Loading track…" : isTransitioning ? "Switching…" : "Connecting…"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Progress */}
                <div className="space-y-1.5">
                  <div className="group h-1.5 cursor-pointer rounded-full bg-white/[0.08]" onClick={handleSeek}>
                    <div className="relative h-full rounded-full bg-[#E8282B]" style={{ width: `${progressRatio * 100}%` }}>
                      <div className="absolute right-0 top-1/2 h-3.5 w-3.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100 shadow-md" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs tabular-nums text-white/25">
                    <span>{formatTime(progressMs / 1000)}</span>
                    <span>{formatTime(durationMs / 1000)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-5">
                  <button onClick={toggleShuffle} title="Shuffle"
                    className={`p-3 rounded-2xl transition-colors ${shuffleEnabled ? "text-[#E8282B] bg-[#E8282B]/10" : "text-white/25 hover:text-white hover:bg-white/[0.07]"}`}>
                    <Shuffle size={18} />
                  </button>
                  <button onClick={() => prevIndex !== null && fetchAndPlay(prevIndex)} title="Previous" disabled={isTransitioning}
                    className="p-3 rounded-2xl text-white/70 hover:text-white hover:bg-white/[0.07] transition-colors">
                    <SkipBack size={22} fill="currentColor" />
                  </button>
                  <button onClick={togglePlay} disabled={playDisabled || isTransitioning} title={isPlaying ? "Pause" : "Play"}
                    className="btn-red p-5 rounded-full active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                    {playBusy
                      ? <Loader2 size={24} className="text-white animate-spin" />
                      : isPlaying
                        ? <Pause size={24} fill="white" className="text-white" />
                        : <Play size={24} fill="white" className="text-white" />
                    }
                  </button>
                  <button onClick={() => nextIndex !== null && fetchAndPlay(nextIndex)} title="Next" disabled={isTransitioning}
                    className="p-3 rounded-2xl text-white/70 hover:text-white hover:bg-white/[0.07] transition-colors">
                    <SkipForward size={22} fill="currentColor" />
                  </button>
                  <button onClick={cycleRepeatMode} title="Repeat"
                    className={`p-3 rounded-2xl transition-colors ${repeatMode !== "off" ? "text-[#E8282B] bg-[#E8282B]/10" : "text-white/25 hover:text-white hover:bg-white/[0.07]"}`}>
                    <RepeatIcon size={18} />
                  </button>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={handleAddToPlaylist} disabled={resolvingAdd} title="Add to playlist"
                      className="shrink-0 p-2.5 rounded-2xl text-white/30 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors disabled:opacity-40">
                      {resolvingAdd ? <Loader2 size={18} className="animate-spin" /> : <ListPlus size={18} />}
                    </button>
                  </div>
                </div>

                <p className="text-center text-xs text-white/20">{Math.max(queueIndex + 1, 1)} / {queue.length} in queue</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Compact bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40"
        style={{ background: "rgba(9,3,5,0.97)", backdropFilter: "blur(28px)" }}>

        {/* Progress bar */}
        <div className="h-[3px] cursor-pointer group relative" style={{ background: "rgba(255,255,255,0.06)" }} onClick={handleSeek}>
          <div className="h-full transition-all relative" style={{ width: `${progressRatio * 100}%`, background: "linear-gradient(90deg, #c62828, #E8282B, #ff5252)" }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md shadow-[#E8282B]/40" />
          </div>
        </div>

        <div className="max-w-xl mx-auto px-4 h-[72px] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">

          {/* Artwork + track info */}
          <button
            onClick={() => usePlayerStore.setState({ isPlayerExpanded: true })}
            className="flex items-center gap-3 min-w-0 flex-1 text-left group/info"
            title="Open player"
          >
            <div className="relative w-11 h-11 shrink-0 rounded-2xl overflow-hidden shadow-lg shadow-black/40">
              {currentTrack.image
                ? <Image src={currentTrack.image} alt={currentTrack.name} fill unoptimized className="object-cover" sizes="44px" />
                : <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--card)" }}><Music size={16} className="text-white/25" /></div>
              }
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate leading-snug group-hover/info:text-[#E8282B]/90 transition-colors">{currentTrack.name}</p>
              <p className="text-white/40 text-xs truncate mt-0.5">
                {isTransitioning && pendingTrack ? `Switching to ${pendingTrack.name}...` : currentTrack.artist}
              </p>
            </div>
          </button>

          {/* Playback controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={toggleShuffle} title="Shuffle"
              className={`p-2 rounded-xl transition-colors ${shuffleEnabled ? "text-[#E8282B]" : "text-white/30 hover:text-white"}`}>
              <Shuffle size={16} />
            </button>
            <button onClick={() => prevIndex !== null && fetchAndPlay(prevIndex)} title="Previous" disabled={isTransitioning}
              className="p-2 rounded-xl text-white/40 hover:text-white transition-colors disabled:opacity-30">
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button onClick={togglePlay} disabled={playDisabled || isTransitioning}
              className="btn-red mx-1 p-3 rounded-full active:scale-95 disabled:opacity-40 transition-transform">
              {(!currentTrack || !isPlaying) && playBusy
                ? <Loader2 size={18} className="text-white animate-spin" />
                : isPlaying
                  ? <Pause size={18} fill="white" className="text-white" />
                  : <Play size={18} fill="white" className="text-white ml-0.5" />}
            </button>
            <button onClick={() => nextIndex !== null && fetchAndPlay(nextIndex)} title="Next" disabled={isTransitioning}
              className="p-2 rounded-xl text-white/40 hover:text-white transition-colors disabled:opacity-30">
              <SkipForward size={18} fill="currentColor" />
            </button>
            <button onClick={cycleRepeatMode} title={repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat off"}
              className={`p-2 rounded-xl transition-colors ${repeatMode !== "off" ? "text-[#E8282B]" : "text-white/30 hover:text-white"}`}>
              <RepeatIcon size={16} />
            </button>
            <button onClick={handleAddToPlaylist} disabled={resolvingAdd} title="Add to playlist"
              className="p-2 rounded-xl text-[#E8282B]/50 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors disabled:opacity-30">
              {resolvingAdd ? <Loader2 size={16} className="animate-spin" /> : <ListPlus size={16} />}
            </button>
            <button onClick={stop} title="Close"
              className="p-2 rounded-xl text-white/25 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
              <X size={16} />
            </button>
          </div>

        </div>
      </div>

      {modalTrack && (
        <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />
      )}
    </>
  );
}
