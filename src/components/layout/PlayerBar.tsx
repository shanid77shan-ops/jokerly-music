"use client";

import { useEffect, useCallback, useState } from "react";
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

export default function PlayerBar() {
  const { data: session } = useSession();
  const {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
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
  } =
    usePlayerStore();
  const [fetching, setFetching] = useState(false);
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const [resolvingAdd, setResolvingAdd] = useState(false);

  const handleAddToPlaylist = useCallback(async () => {
    if (!currentTrack) return;
    if (currentTrack.uri) {
      setModalTrack({ name: currentTrack.name, uri: currentTrack.uri, image: currentTrack.image, artist: currentTrack.artist });
      return;
    }
    setResolvingAdd(true);
    try {
      const res = await fetch(
        `/api/spotify/resolve?track=${encodeURIComponent(currentTrack.name)}&artist=${encodeURIComponent(currentTrack.artist)}`
      );
      const data = await res.json();
      if (data.uri) setModalTrack({ name: currentTrack.name, uri: data.uri });
    } finally {
      setResolvingAdd(false);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!session?.accessToken) return;
    initializePlayer(session.accessToken);
  }, [session?.accessToken, initializePlayer]);

  const fetchAndPlay = useCallback(async (index: number) => {
    if (index < 0 || index >= queue.length || fetching) return;
    const track = queue[index];

    if (track.uri !== undefined) {
      playIndex(index);
      return;
    }

    setFetching(true);
    try {
      const res = await fetch(
        `/api/spotify/resolve?track=${encodeURIComponent(track.name)}&artist=${encodeURIComponent(track.artist)}`
      );
      const data = await res.json();
      updateTrackUri(index, data.uri ?? null, data.imageUrl, data.durationMs ?? undefined);
      usePlayerStore.getState().playIndex(index);
    } finally {
      setFetching(false);
    }
  }, [queue, fetching, playIndex, updateTrackUri]);

  useEffect(() => {
    if (!endedToken) return;
    const nextIndex = getNextIndex();
    if (nextIndex === null) return;
    fetchAndPlay(nextIndex);
  }, [endedToken, fetchAndPlay, getNextIndex]);

  if (sdkError && !currentTrack) {
    return (
      <div className="fixed bottom-16 sm:bottom-0 left-0 right-0 z-40 border-t border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: "rgba(8,8,15,0.95)", backdropFilter: "blur(20px)" }}>
        <p className="text-[#f0a500] text-sm truncate">{sdkError}</p>
        {sdkError.includes("Premium") || sdkError.includes("auth") ? null : (
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 text-xs bg-[#f0a500] text-white px-3 py-1.5 rounded-xl font-medium">
            Re-login
          </button>
        )}
      </div>
    );
  }

  if (!currentTrack) return null;

  const prevIndex = getPrevIndex();
  const nextIndex = getNextIndex();
  const hasPrev = prevIndex !== null;
  const hasNext = nextIndex !== null;
  const progressRatio = durationMs > 0 ? Math.min(progressMs / durationMs, 1) : 0;
  const noTrackUri = currentTrack.uri === null;
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

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
      {/* Expanded Now Playing */}
      {expanded && (
        <div className="fixed inset-0 z-50 p-4 sm:p-6 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(6,4,16,0.96)", backdropFilter: "blur(28px)" }}>
          <div className="w-full max-w-sm">
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

                {/* Title + add */}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-bold text-white">{currentTrack.name}</p>
                    <p className="mt-0.5 truncate text-sm text-white/40">{currentTrack.artist}</p>
                  </div>
                  <button onClick={handleAddToPlaylist} disabled={resolvingAdd} title="Add to playlist"
                    className="shrink-0 p-2.5 rounded-2xl text-white/30 hover:text-[#f0a500] hover:bg-[#f0a500]/10 transition-colors disabled:opacity-40">
                    {resolvingAdd ? <Loader2 size={20} className="animate-spin" /> : <ListPlus size={20} />}
                  </button>
                </div>

                {/* Progress */}
                <div className="space-y-1.5">
                  <div className="group h-1.5 cursor-pointer rounded-full bg-white/[0.08]" onClick={handleSeek}>
                    <div className="relative h-full rounded-full bg-[#f0a500]" style={{ width: `${progressRatio * 100}%` }}>
                      <div className="absolute right-0 top-1/2 h-3.5 w-3.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100 shadow-md" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs tabular-nums text-white/25">
                    <span>{formatTime(progressMs / 1000)}</span>
                    <span>{formatTime(durationMs / 1000)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between px-2">
                  <button onClick={toggleShuffle} title="Shuffle"
                    className={`p-3 rounded-2xl transition-colors ${shuffleEnabled ? "text-[#f0a500] bg-[#f0a500]/10" : "text-white/25 hover:text-white hover:bg-white/[0.07]"}`}>
                    <Shuffle size={18} />
                  </button>
                  <button onClick={() => prevIndex !== null && fetchAndPlay(prevIndex)} disabled={!hasPrev || fetching} title="Previous"
                    className="p-3 rounded-2xl text-white/70 hover:text-white hover:bg-white/[0.07] disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <SkipBack size={22} fill="currentColor" />
                  </button>
                  <button onClick={togglePlay} disabled={noTrackUri || fetching || !isPlayerReady} title={isPlaying ? "Pause" : "Play"}
                    className="p-5 rounded-full bg-[#f0a500] hover:bg-[#c47f00] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#f0a500]/30">
                    {isPlaying ? <Pause size={24} fill="white" className="text-white" /> : <Play size={24} fill="white" className="text-white" />}
                  </button>
                  <button onClick={() => nextIndex !== null && fetchAndPlay(nextIndex)} disabled={!hasNext || fetching} title="Next"
                    className="p-3 rounded-2xl text-white/70 hover:text-white hover:bg-white/[0.07] disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <SkipForward size={22} fill="currentColor" />
                  </button>
                  <button onClick={cycleRepeatMode} title="Repeat"
                    className={`p-3 rounded-2xl transition-colors ${repeatMode !== "off" ? "text-[#f0a500] bg-[#f0a500]/10" : "text-white/25 hover:text-white hover:bg-white/[0.07]"}`}>
                    <RepeatIcon size={18} />
                  </button>
                </div>

                <p className="text-center text-xs text-white/20">{Math.max(queueIndex + 1, 1)} / {queue.length} in queue</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compact bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#f0a500]/[0.18]"
        style={{ background: "rgba(7,5,18,0.98)", backdropFilter: "blur(24px)" }}>
        {/* Progress line */}
        <div className="h-[2px] bg-white/[0.06] cursor-pointer group" onClick={handleSeek}>
          <div className="h-full bg-[#f0a500] relative" style={{ width: `${progressRatio * 100}%` }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2" />
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-3 h-[68px] flex items-center gap-2">
          {/* Track info */}
          <button onClick={() => usePlayerStore.setState({ isPlayerExpanded: true })} className="flex min-w-0 flex-1 items-center gap-3 text-left" title="Open player">
            <div className="relative w-11 h-11 shrink-0">
              {currentTrack.image ? (
                <Image src={currentTrack.image} alt={currentTrack.name} fill unoptimized className="rounded-xl object-cover" sizes="44px" />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-white/[0.07] flex items-center justify-center">
                  <Music size={16} className="text-white/25" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate leading-tight">{currentTrack.name}</p>
              <p className="text-white/40 text-xs truncate">{currentTrack.artist}</p>
            </div>
          </button>

          {/* Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={toggleShuffle}
              className={`hidden sm:flex p-2 rounded-xl transition-colors ${shuffleEnabled ? "text-[#f0a500]" : "text-white/25 hover:text-white/70"}`}>
              <Shuffle size={14} />
            </button>
            <button onClick={() => prevIndex !== null && fetchAndPlay(prevIndex)} disabled={!hasPrev || fetching}
              className="p-2 rounded-xl text-white/50 hover:text-white disabled:opacity-20 transition-colors">
              <SkipBack size={17} />
            </button>
            <button onClick={togglePlay} disabled={noTrackUri || fetching || !isPlayerReady}
              className="p-2.5 rounded-full bg-[#f0a500] hover:bg-[#c47f00] active:scale-95 disabled:opacity-40 transition-all">
              {isPlaying ? <Pause size={17} fill="white" className="text-white" /> : <Play size={17} fill="white" className="text-white" />}
            </button>
            <button onClick={() => nextIndex !== null && fetchAndPlay(nextIndex)} disabled={!hasNext || fetching}
              className="p-2 rounded-xl text-white/50 hover:text-white disabled:opacity-20 transition-colors">
              <SkipForward size={17} />
            </button>
            <button onClick={cycleRepeatMode}
              className={`hidden sm:flex p-2 rounded-xl transition-colors ${repeatMode !== "off" ? "text-[#f0a500]" : "text-white/25 hover:text-white/70"}`}>
              <RepeatIcon size={14} />
            </button>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-0.5 shrink-0">
            {!isPlayerReady && !sdkError && (
              <span className="text-white/20 text-xs hidden sm:block">Connecting…</span>
            )}
            {noTrackUri && (
              <span className="text-white/20 text-xs hidden sm:block">Not on Spotify</span>
            )}
            {isPlayerReady && !noTrackUri && !sdkError && (
              <span className="text-white/25 text-xs tabular-nums whitespace-nowrap hidden sm:block">
                {formatTime(progressMs / 1000)} / {formatTime(durationMs / 1000)}
              </span>
            )}
            <button onClick={handleAddToPlaylist} disabled={resolvingAdd} title="Add to playlist"
              className="p-1.5 rounded-xl text-white/25 hover:text-[#f0a500] transition-colors disabled:opacity-40">
              {resolvingAdd ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
            </button>
            <button onClick={stop} className="p-1.5 rounded-xl text-white/20 hover:text-white/60 transition-colors" title="Close">
              <X size={14} />
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
