"use client";

import { useEffect, useCallback, useState } from "react";
import { usePlayerStore } from "@/store/player";
import { Play, Pause, SkipBack, SkipForward, X, Music, Repeat, Repeat1, Shuffle, ChevronDown } from "lucide-react";
import Image from "next/image";
import { useSession } from "next-auth/react";

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
  const [expanded, setExpanded] = useState(false);

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

  if (!currentTrack) return null;

  const prevIndex = getPrevIndex();
  const nextIndex = getNextIndex();
  const hasPrev = prevIndex !== null;
  const hasNext = nextIndex !== null;
  const progressRatio = durationMs > 0 ? Math.min(progressMs / durationMs, 1) : 0;
  const noTrackUri = currentTrack.uri === null;
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  const cycleRepeatMode = () => {
    if (repeatMode === "off") {
      setRepeatMode("all");
      return;
    }
    if (repeatMode === "all") {
      setRepeatMode("one");
      return;
    }
    setRepeatMode("off");
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek((e.clientX - rect.left) / rect.width);
  };

  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 sm:p-6">
          <div className="mx-auto flex h-full max-w-xl flex-col justify-center">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/95 p-5 shadow-2xl shadow-black/70">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-500">Now Playing</p>
                <button
                  onClick={() => setExpanded(false)}
                  className="rounded-xl p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                  title="Close player"
                >
                  <ChevronDown size={18} />
                </button>
              </div>

              <div className="space-y-5">
                <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-3xl bg-zinc-900 shadow-2xl shadow-red-500/10">
                  {currentTrack.image ? (
                    <Image
                      src={currentTrack.image}
                      alt={currentTrack.name}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="(max-width: 768px) 80vw, 320px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Music size={64} className="text-zinc-700" />
                    </div>
                  )}
                </div>

                <div className="text-center">
                  <p className="truncate text-2xl font-bold text-white">{currentTrack.name}</p>
                  <p className="mt-1 truncate text-sm text-zinc-400">{currentTrack.artist}</p>
                </div>

                <div
                  className="group h-2 cursor-pointer rounded-full bg-zinc-800"
                  onClick={handleSeek}
                >
                  <div
                    className="relative h-full rounded-full bg-red-500 transition-colors group-hover:bg-red-400"
                    style={{ width: `${progressRatio * 100}%` }}
                  >
                    <div className="absolute right-0 top-1/2 h-4 w-4 translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs tabular-nums text-zinc-500">
                  <span>{formatTime(progressMs / 1000)}</span>
                  <span>{formatTime(durationMs / 1000)}</span>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={toggleShuffle}
                    className={`rounded-2xl p-3 transition-colors ${shuffleEnabled ? "bg-red-500/15 text-red-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                    title="Shuffle"
                  >
                    <Shuffle size={18} />
                  </button>
                  <button
                    onClick={() => prevIndex !== null && fetchAndPlay(prevIndex)}
                    disabled={!hasPrev || fetching}
                    className="rounded-2xl p-3 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    title="Previous"
                  >
                    <SkipBack size={22} />
                  </button>
                  <button
                    onClick={togglePlay}
                    disabled={noTrackUri || fetching || !isPlayerReady}
                    className="rounded-full bg-red-500 p-5 text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                  </button>
                  <button
                    onClick={() => nextIndex !== null && fetchAndPlay(nextIndex)}
                    disabled={!hasNext || fetching}
                    className="rounded-2xl p-3 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                    title="Next"
                  >
                    <SkipForward size={22} />
                  </button>
                  <button
                    onClick={cycleRepeatMode}
                    className={`rounded-2xl p-3 transition-colors ${repeatMode !== "off" ? "bg-red-500/15 text-red-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                    title={repeatMode === "off" ? "Repeat off" : repeatMode === "all" ? "Repeat all" : "Repeat one"}
                  >
                    <RepeatIcon size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-zinc-500 sm:grid-cols-4">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2">
                    <span className="block uppercase tracking-wide">Shuffle</span>
                    <span className="mt-1 block text-sm text-white">{shuffleEnabled ? "On" : "Off"}</span>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2">
                    <span className="block uppercase tracking-wide">Repeat</span>
                    <span className="mt-1 block text-sm text-white">{repeatMode === "off" ? "Off" : repeatMode === "all" ? "Queue" : "Track"}</span>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2">
                    <span className="block uppercase tracking-wide">Queue</span>
                    <span className="mt-1 block text-sm text-white">{Math.max(queueIndex + 1, 1)} / {queue.length}</span>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2">
                    <span className="block uppercase tracking-wide">Auto Next</span>
                    <span className="mt-1 block text-sm text-white">{repeatMode === "one" ? "Loop 1" : hasNext ? "Ready" : repeatMode === "all" ? "Wrap" : "Stop"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/98 backdrop-blur border-t border-zinc-800">
      {/* Progress bar */}
      <div
        className="h-1 bg-zinc-800 cursor-pointer group"
        onClick={handleSeek}
      >
        <div
          className="h-full bg-red-500 relative group-hover:bg-red-400 transition-colors"
          style={{ width: `${progressRatio * 100}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
        {/* Track info */}
        <button
          onClick={() => setExpanded(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          title="Open now playing"
        >
          <div className="relative w-12 h-12 shrink-0 shadow-lg">
            {currentTrack.image ? (
              <Image src={currentTrack.image} alt={currentTrack.name} fill unoptimized className="rounded-lg object-cover" sizes="48px" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Music size={18} className="text-zinc-600" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-tight">{currentTrack.name}</p>
            <p className="text-zinc-400 text-xs truncate">{currentTrack.artist}</p>
          </div>
        </button>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => prevIndex !== null && fetchAndPlay(prevIndex)}
            disabled={!hasPrev || fetching}
            className="p-2 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous"
          >
            <SkipBack size={18} />
          </button>

          <button
            onClick={togglePlay}
            disabled={noTrackUri || fetching || !isPlayerReady}
            className="p-2.5 rounded-full bg-red-500 hover:bg-red-400 active:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white" />}
          </button>

          <button
            onClick={() => nextIndex !== null && fetchAndPlay(nextIndex)}
            disabled={!hasNext || fetching}
            className="p-2 rounded-lg text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* Time + status */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {sdkError ? (
            <span className="text-red-400 text-xs truncate max-w-[180px]" title={sdkError}>
              {sdkError}
            </span>
          ) : !isPlayerReady ? (
            <span className="text-zinc-600 text-xs">Connecting player...</span>
          ) : noTrackUri ? (
            <span className="text-zinc-600 text-xs">Not found on Spotify</span>
          ) : (
            <span className="text-zinc-500 text-xs tabular-nums whitespace-nowrap">
              {formatTime(progressMs / 1000)} / {formatTime(durationMs / 1000)}
            </span>
          )}
          <button
            onClick={stop}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
