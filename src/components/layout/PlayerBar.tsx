"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { usePlayerStore } from "@/store/player";
import { useLikesStore } from "@/store/likes";
import { Play, Pause, SkipBack, SkipForward, X, Music, Repeat, Repeat1, Shuffle, ChevronDown, ListPlus, Loader2, Heart, Volume1, Volume2, VolumeX, ListOrdered, Timer, MicVocal } from "lucide-react";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import AddToPlaylistModal from "@/components/playlist/AddToPlaylistModal";
import QueueSheet from "@/components/player/QueueSheet";
import LyricsPanel from "@/components/player/LyricsPanel";
import { useToastStore } from "@/store/toast";

function formatTime(seconds: number) {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildMediaArtwork(imageUrl?: string) {
  if (!imageUrl) return [] as MediaImage[];
  // iOS lock-screen behavior is inconsistent across versions; provide multiple sizes.
  const sizes = ["96x96", "128x128", "192x192", "256x256", "384x384", "512x512"];
  return sizes.map((size) => ({ src: imageUrl, sizes: size }));
}

// Client-side resolve cache so the same track never hits the API twice
const resolveCache = new Map<string, { uri: string | null; imageUrl?: string | null; durationMs?: number }>();

export default function PlayerBar() {
  const { data: session } = useSession();
  const sessionError = (session as { error?: string } | null)?.error;
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
    crossfadeEnabled,
    crossfadeSeconds,
    volume,
    endedToken,
    isPlayerExpanded: expanded,
    isQueueOpen,
    sleepTimerEndsAt,
    initializePlayer,
    togglePlay,
    playIndex,
    updateTrackUri,
    seek,
    stop,
    setRepeatMode,
    toggleShuffle,
    setCrossfadeEnabled,
    setCrossfadeSeconds,
    setVolume,
    setSleepTimer,
    getNextIndex,
    getPrevIndex,
  } = usePlayerStore();

  const { load: loadLikes, songUris, toggleSong } = useLikesStore();
  const { toast } = useToastStore();
  const isLiked = currentTrack?.uri ? songUris.has(currentTrack.uri) : false;

  const handleLike = () => {
    if (!currentTrack?.uri) return;
    toggleSong({ uri: currentTrack.uri, name: currentTrack.name, image: currentTrack.image, artist: currentTrack.artist });
  };

  const [fetching, setFetching] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [modalTrack, setModalTrack] = useState<{ name: string; uri: string; image?: string | null; artist?: string | null } | null>(null);
  const [resolvingAdd, setResolvingAdd] = useState(false);
  const fetchingRef = useRef(false);
  const crossfadeGuardRef = useRef<string | null>(null);

  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const fadePlayerVolumeTransient = useCallback(async (from: number, to: number, durationMs: number) => {
    const player = usePlayerStore.getState().player;
    if (!player) return;
    const steps = 6;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const value = from + (to - from) * t;
      await player.setVolume(Math.max(0, Math.min(1, value))).catch(() => {});
      await wait(Math.max(20, Math.floor(durationMs / steps)));
    }
  }, []);

  const playWithTransition = useCallback(async (index: number, smooth = false) => {
    if (!smooth || !crossfadeEnabled || crossfadeSeconds <= 0) {
      playIndex(index);
      return;
    }

    const baseVolume = usePlayerStore.getState().volume;
    const lowVolume = Math.max(0.12, baseVolume * 0.35);
    await fadePlayerVolumeTransient(baseVolume, lowVolume, 260);
    playIndex(index);
    await wait(120);
    await fadePlayerVolumeTransient(lowVolume, baseVolume, 520);
  }, [crossfadeEnabled, crossfadeSeconds, fadePlayerVolumeTransient, playIndex]);

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

  useEffect(() => { loadLikes(); }, [loadLikes]);

  useEffect(() => {
    if (!session?.accessToken || sessionError) return;
    initializePlayer(session.accessToken);
  }, [session?.accessToken, sessionError, initializePlayer]);

  const fetchAndPlay = useCallback(async (index: number, options?: { smooth?: boolean }) => {
    if (index < 0 || index >= queue.length || fetchingRef.current) return;
    const track = queue[index];

    if (track.uri !== undefined) {
      await playWithTransition(index, options?.smooth ?? false);
      return;
    }

    // Check client-side cache first
    const cacheKey = `${track.name}::${track.artist}`;
    const cached = resolveCache.get(cacheKey);
    if (cached !== undefined) {
      updateTrackUri(index, cached.uri, cached.imageUrl, cached.durationMs);
      await playWithTransition(index, options?.smooth ?? false);
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
      await playWithTransition(index, options?.smooth ?? false);
    } finally {
      fetchingRef.current = false;
      setFetching(false);
    }
  }, [playWithTransition, queue, updateTrackUri]);

  const ensurePlayingForAction = useCallback((action: "pause" | "next" | "prev" | "switch") => {
    const currentlyPlaying = usePlayerStore.getState().isPlaying;
    if (currentlyPlaying) return true;

    const actionLabel = action === "pause"
      ? "pause"
      : action === "next"
        ? "next"
        : action === "prev"
          ? "go to previous"
        : "switch songs";

    toast(`Cannot ${actionLabel} because music is not playing.`, "error");
    return false;
  }, [toast]);

  const handleNextTrack = useCallback(() => {
    if (!ensurePlayingForAction("next")) return;
    const state = usePlayerStore.getState();
    const next = state.getNextIndex();
    if (next === null || next === state.queueIndex) return;
    fetchAndPlay(next);
  }, [ensurePlayingForAction, fetchAndPlay]);

  const handlePrevTrack = useCallback(() => {
    if (!ensurePlayingForAction("prev")) return;
    const state = usePlayerStore.getState();
    const prev = state.getPrevIndex();
    if (prev === null || prev === state.queueIndex) return;
    fetchAndPlay(prev);
  }, [ensurePlayingForAction, fetchAndPlay]);

  const handlePlayPause = useCallback(() => {
    togglePlay();
  }, [togglePlay]);

  const handleQueuePlayIndex = useCallback((index: number) => {
    if (!ensurePlayingForAction("switch")) return false;
    fetchAndPlay(index);
    return true;
  }, [ensurePlayingForAction, fetchAndPlay]);

  useEffect(() => {
    if (!endedToken) return;
    const nextIndex = getNextIndex();
    if (nextIndex === null) return;
    fetchAndPlay(nextIndex);
  }, [endedToken, fetchAndPlay, getNextIndex]);

  useEffect(() => {
    crossfadeGuardRef.current = null;
  }, [queueIndex, currentTrack?.uri]);

  useEffect(() => {
    if (!crossfadeEnabled || !isPlaying || isTransitioning || durationMs <= 0 || progressMs <= 0) return;
    const nextIndex = getNextIndex();
    if (nextIndex === null || nextIndex === queueIndex) return;

    const remainingMs = durationMs - progressMs;
    const thresholdMs = crossfadeSeconds * 1000;
    if (remainingMs > thresholdMs || remainingMs <= 250) return;

    const guardKey = `${queueIndex}:${currentTrack?.uri ?? currentTrack?.name}:${nextIndex}`;
    if (crossfadeGuardRef.current === guardKey) return;
    crossfadeGuardRef.current = guardKey;
    fetchAndPlay(nextIndex, { smooth: true });
  }, [
    crossfadeEnabled,
    crossfadeSeconds,
    currentTrack?.name,
    currentTrack?.uri,
    durationMs,
    fetchAndPlay,
    getNextIndex,
    isPlaying,
    isTransitioning,
    progressMs,
    queueIndex,
  ]);

  // Advance progress locally every 500 ms while playing so the bar moves
  // smoothly between infrequent SDK state-change events.
  // Also keeps MediaSession position state in sync for the OS seek bar.
  useEffect(() => {
    if (!isPlaying || durationMs <= 0) return;
    const id = setInterval(() => {
      usePlayerStore.setState((s) => {
        if (!s.isPlaying || s.durationMs <= 0) return s;
        const next = Math.min(s.progressMs + 500, s.durationMs);
        if (typeof navigator !== "undefined" && "mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
          try {
            navigator.mediaSession.setPositionState({
              duration: s.durationMs / 1000,
              playbackRate: 1,
              position: next / 1000,
            });
          } catch {}
        }
        return { progressMs: next };
      });
    }, 500);
    return () => clearInterval(id);
  }, [isPlaying, durationMs]);

  // Media Session API — drives the OS lock-screen / notification player
  // with track metadata, artwork, and prev/next/play/pause/seek actions.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const artwork = buildMediaArtwork(currentTrack.image);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.name || "Now Playing",
      artist: currentTrack.artist || "Jokerly",
      album: "Jokerly",
      artwork,
    });
  }, [currentTrack]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => togglePlay());
    navigator.mediaSession.setActionHandler("pause", () => {
      if (!ensurePlayingForAction("pause")) return;
      togglePlay();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      handlePrevTrack();
    });
    navigator.mediaSession.setActionHandler("nexttrack", handleNextTrack);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) {
        const { durationMs: dur } = usePlayerStore.getState();
        if (dur > 0) usePlayerStore.getState().seek(details.seekTime / (dur / 1000));
      }
    });
    return () => {
      (["play", "pause", "previoustrack", "nexttrack", "seekto"] as MediaSessionAction[]).forEach((a) => {
        try { navigator.mediaSession.setActionHandler(a, null); } catch {}
      });
    };
  }, [togglePlay, fetchAndPlay, ensurePlayingForAction, handleNextTrack, handlePrevTrack]);

  // Sleep timer countdown
  useEffect(() => {
    if (!sleepTimerEndsAt) { setTimerRemaining(null); return; }
    const tick = () => {
      const diff = sleepTimerEndsAt - Date.now();
      if (diff <= 0) {
        usePlayerStore.getState().togglePlay();
        usePlayerStore.getState().setSleepTimer(null);
        setTimerRemaining(null);
        return;
      }
      const m = Math.floor(diff / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setTimerRemaining(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepTimerEndsAt]);

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

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

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
      {/* ── Queue Sheet ── */}
      {isQueueOpen ? <QueueSheet onPlayIndex={handleQueuePlayIndex} /> : null}

      {/* ── Expanded Now Playing ── */}
      {expanded && (
        <div className="fixed inset-0 z-50 p-4 sm:p-6 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(6,4,16,0.96)", backdropFilter: "blur(28px)" }}
          onClick={() => usePlayerStore.setState({ isPlayerExpanded: false })}>
          <div className="w-full max-w-sm max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-3xl border border-white/[0.08] p-5 shadow-2xl shadow-black/80 flex flex-col min-h-0 max-h-full overflow-hidden"
              style={{ background: "var(--surface)" }}>
              <div className="mb-4 flex items-center justify-between shrink-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/30">Now Playing</p>
                <button onClick={() => usePlayerStore.setState({ isPlayerExpanded: false })}
                  className="rounded-xl p-2 text-white/30 hover:bg-white/[0.07] hover:text-white transition-colors">
                  <ChevronDown size={18} />
                </button>
              </div>

              <div className="space-y-5 overflow-y-auto min-h-0 flex-1 pr-0.5 scrollbar-hide">
                {/* Album art */}
                <div className="relative mx-auto aspect-square w-full max-h-[38vh] overflow-hidden rounded-3xl shadow-2xl shadow-black/60 shrink-0"
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

                {/* Volume */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setVolume(volume === 0 ? 0.5 : 0)} className="shrink-0 text-white/30 hover:text-white transition-colors">
                    <VolumeIcon size={16} />
                  </button>
                  <input
                    type="range" min={0} max={1} step={0.02} value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer accent-[#E8282B]"
                    style={{ background: `linear-gradient(to right, #E8282B ${volume * 100}%, rgba(255,255,255,0.12) ${volume * 100}%)` }}
                  />
                  <span className="text-xs tabular-nums text-white/25 w-7 text-right">{Math.round(volume * 100)}</span>
                </div>

                {/* Controls */}
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-5">
                  <button onClick={toggleShuffle} title="Shuffle"
                    className={`p-3 rounded-2xl transition-colors ${shuffleEnabled ? "text-[#E8282B] bg-[#E8282B]/10" : "text-white/25 hover:text-white hover:bg-white/[0.07]"}`}>
                    <Shuffle size={18} />
                  </button>
                  <button onClick={handlePrevTrack} title="Previous" disabled={isTransitioning}
                    className="p-3 rounded-2xl text-white/70 hover:text-white hover:bg-white/[0.07] transition-colors">
                    <SkipBack size={22} fill="currentColor" />
                  </button>
                  <button onClick={handlePlayPause} disabled={playDisabled || isTransitioning} title={isPlaying ? "Pause" : "Play"}
                    className="btn-red p-5 rounded-full active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                    {playBusy
                      ? <Loader2 size={24} className="text-white animate-spin" />
                      : isPlaying
                        ? <Pause size={24} fill="white" className="text-white" />
                        : <Play size={24} fill="white" className="text-white" />
                    }
                  </button>
                  <button onClick={handleNextTrack} title="Next" disabled={isTransitioning}
                    className="p-3 rounded-2xl text-white/70 hover:text-white hover:bg-white/[0.07] transition-colors">
                    <SkipForward size={22} fill="currentColor" />
                  </button>
                  <button onClick={cycleRepeatMode} title="Repeat"
                    className={`p-3 rounded-2xl transition-colors ${repeatMode !== "off" ? "text-[#E8282B] bg-[#E8282B]/10" : "text-white/25 hover:text-white hover:bg-white/[0.07]"}`}>
                    <RepeatIcon size={18} />
                  </button>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={handleLike} title={isLiked ? "Unlike" : "Like"}
                      className={`shrink-0 p-2.5 rounded-2xl transition-colors ${isLiked ? "text-[#E8282B] bg-[#E8282B]/10" : "text-white/30 hover:text-[#E8282B] hover:bg-[#E8282B]/10"}`}>
                      <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                    </button>
                    <button onClick={handleAddToPlaylist} disabled={resolvingAdd} title="Add to playlist"
                      className="shrink-0 p-2.5 rounded-2xl text-white/30 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors disabled:opacity-40">
                      {resolvingAdd ? <Loader2 size={18} className="animate-spin" /> : <ListPlus size={18} />}
                    </button>
                    <button onClick={() => { usePlayerStore.setState({ isQueueOpen: true, isPlayerExpanded: false }); }} title="Queue"
                      className="shrink-0 p-2.5 rounded-2xl text-white/30 hover:text-white hover:bg-white/[0.07] transition-colors">
                      <ListOrdered size={18} />
                    </button>
                    <button onClick={() => setShowLyrics(true)} title="Lyrics"
                      className={`shrink-0 p-2.5 rounded-2xl transition-colors ${showLyrics ? "text-[#E8282B] bg-[#E8282B]/10" : "text-white/30 hover:text-white hover:bg-white/[0.07]"}`}>
                      <MicVocal size={18} />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setShowTimerPicker((v) => !v)}
                        title="Sleep timer"
                        className={`shrink-0 p-2.5 rounded-2xl transition-colors ${sleepTimerEndsAt ? "text-[#E8282B] bg-[#E8282B]/10" : "text-white/30 hover:text-white hover:bg-white/[0.07]"}`}
                      >
                        <Timer size={18} />
                      </button>
                      {timerRemaining && (
                        <span className="absolute -top-1 -right-1 text-[9px] font-bold text-[#E8282B] bg-black/80 px-1 rounded-full leading-tight">
                          {timerRemaining}
                        </span>
                      )}
                      {showTimerPicker && (
                        <div className="absolute bottom-full right-0 mb-2 rounded-2xl border border-white/[0.08] p-3 shadow-2xl z-10 w-44"
                          style={{ background: "var(--surface)" }}>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Sleep Timer</p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[15, 30, 45, 60].map((m) => (
                              <button key={m} onClick={() => { setSleepTimer(m); setShowTimerPicker(false); }}
                                className={`py-2 rounded-xl text-xs font-medium transition-colors ${sleepTimerEndsAt ? "bg-[#E8282B] text-white" : "text-white/70 hover:bg-white/[0.12]"}`}
                                style={!sleepTimerEndsAt ? { background: "rgba(255,255,255,0.07)" } : {}}>
                                {m}m
                              </button>
                            ))}
                          </div>
                          {sleepTimerEndsAt && (
                            <button onClick={() => { setSleepTimer(null); setShowTimerPicker(false); }}
                              className="mt-2 w-full py-1.5 rounded-xl text-xs text-white/40 hover:text-white hover:bg-white/[0.07] transition-colors">
                              Cancel Timer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {showLyrics && (
                    <div
                      className="fixed inset-0 z-[999] flex items-center justify-center p-4"
                      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
                      onClick={() => setShowLyrics(false)}
                    >
                      <div
                        className="relative w-full max-w-lg max-h-[85vh] rounded-3xl border border-white/[0.08] flex flex-col overflow-hidden shadow-2xl"
                        style={{ background: "rgba(15,8,10,0.98)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                          <div className="min-w-0 pr-3">
                            <p className="text-sm font-semibold text-white truncate">{currentTrack.name}</p>
                            <p className="text-xs text-white/40 truncate">{currentTrack.artist}</p>
                          </div>
                          <button
                            onClick={() => setShowLyrics(false)}
                            className="shrink-0 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.07] transition-colors"
                            aria-label="Close lyrics"
                          >
                            <X size={18} />
                          </button>
                        </div>
                        {/* Lyrics */}
                        <div className="flex flex-col flex-1 overflow-hidden px-2 py-2">
                          <LyricsPanel track={currentTrack} progressMs={progressMs} fullscreen />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    usePlayerStore.setState({
                      isQueueOpen: true,
                      isPlayerExpanded: false,
                      queueSheetTab: "similar",
                    })
                  }
                  className="w-full rounded-2xl border border-[#E8282B]/25 bg-[#E8282B]/10 px-4 py-3 text-sm font-semibold text-[#E8282B] hover:bg-[#E8282B]/15 transition-colors shrink-0"
                >
                  Open similar music (5 tracks + refresh)
                </button>

                <p className="text-center text-xs text-white/20 shrink-0">{Math.max(queueIndex + 1, 1)} / {queue.length} in queue</p>
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
            <button onClick={handlePrevTrack} title="Previous" disabled={isTransitioning}
              className="p-2 rounded-xl text-white/40 hover:text-white transition-colors disabled:opacity-30">
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button onClick={handlePlayPause} disabled={playDisabled || isTransitioning}
              className="btn-red mx-1 p-3 rounded-full active:scale-95 disabled:opacity-40 transition-transform">
              {(!currentTrack || !isPlaying) && playBusy
                ? <Loader2 size={18} className="text-white animate-spin" />
                : isPlaying
                  ? <Pause size={18} fill="white" className="text-white" />
                  : <Play size={18} fill="white" className="text-white ml-0.5" />}
            </button>
            <button onClick={handleNextTrack} title="Next" disabled={isTransitioning}
              className="p-2 rounded-xl text-white/40 hover:text-white transition-colors disabled:opacity-30">
              <SkipForward size={18} fill="currentColor" />
            </button>
            <button onClick={cycleRepeatMode} title={repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat off"}
              className={`p-2 rounded-xl transition-colors ${repeatMode !== "off" ? "text-[#E8282B]" : "text-white/30 hover:text-white"}`}>
              <RepeatIcon size={16} />
            </button>
            <button onClick={handleLike} title={isLiked ? "Unlike" : "Like"}
              className={`p-2 rounded-xl transition-colors ${isLiked ? "text-[#E8282B]" : "text-white/30 hover:text-[#E8282B]"}`}>
              <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
            </button>
            <button onClick={handleAddToPlaylist} disabled={resolvingAdd} title="Add to playlist"
              className="p-2 rounded-xl text-[#E8282B]/50 hover:text-[#E8282B] hover:bg-[#E8282B]/10 transition-colors disabled:opacity-30">
              {resolvingAdd ? <Loader2 size={16} className="animate-spin" /> : <ListPlus size={16} />}
            </button>
            <button onClick={() => usePlayerStore.setState({ isQueueOpen: true })} title="Queue"
              className="p-2 rounded-xl text-white/25 hover:text-white hover:bg-white/[0.06] transition-colors">
              <ListOrdered size={16} />
            </button>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <button onClick={() => setVolume(volume === 0 ? 0.5 : 0)} className="p-2 rounded-xl text-white/30 hover:text-white transition-colors">
                <VolumeIcon size={16} />
              </button>
              <input
                type="range" min={0} max={1} step={0.02} value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-20 h-1 rounded-full appearance-none cursor-pointer accent-[#E8282B]"
                style={{ background: `linear-gradient(to right, #E8282B ${volume * 100}%, rgba(255,255,255,0.12) ${volume * 100}%)` }}
              />
            </div>
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
