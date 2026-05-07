import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getSession } from "next-auth/react";
import { addLog } from "./debugLog";

export interface PlayableTrack {
  name: string;
  artist: string;
  image?: string;
  uri?: string | null; // undefined = not yet resolved, null = not found on Spotify
  durationMs?: number;
}

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  currentTrack: PlayableTrack | null;
  queue: PlayableTrack[];
  queueIndex: number;
  pendingIndex: number | null;
  isPlaying: boolean;
  isTransitioning: boolean;
  progressMs: number;
  durationMs: number;
  isPlayerReady: boolean;
  sdkError: string | null;
  player: SpotifyPlayer | null;
  deviceId: string | null;
  accessToken: string | null;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  crossfadeEnabled: boolean;
  crossfadeSeconds: number;
  volume: number;
  endedToken: number;
  isPlayerExpanded: boolean;
  isQueueOpen: boolean;
  sleepTimerEndsAt: number | null;

  initializePlayer: (accessToken: string) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  moveToNext: (index: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  setQueueAndPlay: (tracks: PlayableTrack[], index: number) => Promise<void>;
  updateTrackUri: (index: number, uri: string | null, imageUrl?: string | null, durationMs?: number) => void;
  playIndex: (index: number) => void;
  togglePlay: () => void;
  seek: (ratio: number) => void;
  stop: () => void;
  setRepeatMode: (mode: RepeatMode) => Promise<void>;
  toggleShuffle: () => Promise<void>;
  setCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeSeconds: (seconds: number) => void;
  getNextIndex: () => number | null;
  getPrevIndex: () => number | null;
}

interface SpotifyPlayerTrack {
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { images: { url: string }[] };
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: SpotifyPlayerTrack };
}

interface SpotifyPlayer {
  addListener: (event: string, cb: (arg?: unknown) => void) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  pause: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  getVolume: () => Promise<number>;
}

interface SpotifyPlayerCtor {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifyPlayer;
}

function getSpotifyCtor(): SpotifyPlayerCtor | null {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { Spotify?: SpotifyPlayerCtor }).Spotify ?? null;
}

// Spotify emits short-lived paused states during track switches.
// Keep UI stable for a brief window right after a play request.

// iOS audio focus — play a 1-sample silent buffer synchronously within every
// user-gesture handler so iOS transfers audio focus from whatever else is playing.
let _iosAudioCtx: AudioContext | null = null;
function requestAudioFocus() {
  if (typeof window === "undefined") return;
  try {
    const ACtx = (window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!ACtx) return;
    if (!_iosAudioCtx) _iosAudioCtx = new ACtx();
    const buf = _iosAudioCtx.createBuffer(1, 1, 22050);
    const src = _iosAudioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_iosAudioCtx.destination);
    src.start(0);
    if (_iosAudioCtx.state === "suspended") _iosAudioCtx.resume();
  } catch { /* ignore */ }
}
let ignorePausedUntil = 0;
let lastLoggedUri = "";
let suppressAutoResumeUntil = 0;
let autoResumeTimer: ReturnType<typeof setInterval> | null = null;
let pendingPlayOnReadyIndex: number | null = null;
let playRetryTimer: ReturnType<typeof setTimeout> | null = null;

function clearPlayRetry() {
  if (!playRetryTimer) return;
  clearTimeout(playRetryTimer);
  playRetryTimer = null;
}

function schedulePlayRetry(index: number) {
  clearPlayRetry();
  playRetryTimer = setTimeout(() => {
    const snapshot = usePlayerStore.getState();
    if (snapshot.isPlaying || snapshot.queueIndex !== index) return;
    Promise.resolve(snapshot.playIndex(index)).catch(() => {});
  }, 450);
}

function stopAutoResumeLoop() {
  if (!autoResumeTimer) return;
  clearInterval(autoResumeTimer);
  autoResumeTimer = null;
}

function tryAutoResumeFromInterruption() {
  const snapshot = usePlayerStore.getState();
  if (Date.now() < suppressAutoResumeUntil) return;
  if (!snapshot.player || !snapshot.currentTrack || snapshot.queueIndex < 0) {
    stopAutoResumeLoop();
    return;
  }
  if (snapshot.isPlaying) {
    stopAutoResumeLoop();
    return;
  }

  addLog(`[AutoResume] Attempting resume: "${snapshot.currentTrack.name}"`, "warn");
  snapshot.player.togglePlay().catch((e: unknown) => {
    addLog(`[AutoResume] togglePlay failed: ${e instanceof Error ? e.message : String(e)}`, "error");
  });
}

function startAutoResumeLoop() {
  if (autoResumeTimer) return;
  tryAutoResumeFromInterruption();
  autoResumeTimer = setInterval(tryAutoResumeFromInterruption, 700);
}

async function loadSpotifySdk(): Promise<SpotifyPlayerCtor | null> {
  const existing = getSpotifyCtor();
  if (existing) return existing;
  if (typeof window === "undefined") return null;

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Spotify SDK timeout")), 10000);
    const win = window as typeof window & {
      onSpotifyWebPlaybackSDKReady?: () => void;
    };
    win.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    const existingScript = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Failed to load Spotify SDK"));
    };
    document.body.appendChild(script);
  });

  return getSpotifyCtor();
}

function hydrateFromSdkState(state: SpotifyPlayerState | null) {
  if (!state) {
    // A null state fires transiently during device transfers and SDK init.
    // Do NOT reset isPlaying here — the actual stopped/paused state arrives
    // as a non-null state with paused:true which is handled below.
    return;
  }

  const sdkTrack = state.track_window.current_track;
  const prev = usePlayerStore.getState();

  // Only suppress the transient paused+position=0 state that fires right after a playIndex call.
  // The ignorePausedUntil window is set in playIndex; outside that window always trust the SDK.
  if (state.paused && state.position === 0 && Date.now() < ignorePausedUntil) {
    return;
  }

  const { queue } = usePlayerStore.getState();
  const queueIndex = queue.findIndex((item) => item.uri === sdkTrack.uri);
  const currentTrack =
    queueIndex >= 0
      ? queue[queueIndex]
      : {
          name: sdkTrack.name,
          artist: sdkTrack.artists.map((a) => a.name).join(", "),
          image: sdkTrack.album.images?.[0]?.url,
          uri: sdkTrack.uri,
          durationMs: sdkTrack.duration_ms,
        };

  usePlayerStore.setState({
    currentTrack,
    queueIndex: queueIndex >= 0 ? queueIndex : usePlayerStore.getState().queueIndex,
    pendingIndex: null,
    isPlaying: !state.paused,
    isTransitioning: false,
    progressMs: state.position,
    durationMs: state.duration,
  });

  if (!state.paused && currentTrack?.uri && currentTrack.uri !== lastLoggedUri) {
    lastLoggedUri = currentTrack.uri;
    fetch("/api/recently-played", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track_uri: currentTrack.uri,
        track_name: currentTrack.name,
        track_artist: currentTrack.artist,
        track_image: currentTrack.image ?? null,
      }),
    }).catch(() => {});

    fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "play_started",
        track_uri: currentTrack.uri,
        track_name: currentTrack.name,
        track_artist: currentTrack.artist,
        meta: { source: "player" },
      }),
      keepalive: true,
    }).catch(() => {});
  }
}

async function spotifyApi(path: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`Spotify API ${res.status}: ${details}`);
  }
}

async function playerApi(action: "play" | "repeat" | "shuffle", body: Record<string, unknown>) {
  const res = await fetch("/api/spotify/player", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(details || `Player API ${res.status}`);
  }
}

export const usePlayerStore = create<PlayerState>()(persist((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  pendingIndex: null,
  isPlaying: false,
  isTransitioning: false,
  progressMs: 0,
  durationMs: 0,
  isPlayerReady: false,
  sdkError: null,
  player: null,
  deviceId: null,
  accessToken: null,
  repeatMode: "off",
  shuffleEnabled: false,
  crossfadeEnabled: true,
  crossfadeSeconds: 5,
  volume: 0.8,
  endedToken: 0,
  isPlayerExpanded: false,
  isQueueOpen: false,
  sleepTimerEndsAt: null,

  initializePlayer: async (accessToken) => {
    set({ accessToken, sdkError: null });
    if (get().player) return;

    let Spotify: SpotifyPlayerCtor | null = null;
    try {
      Spotify = await loadSpotifySdk();
    } catch (e) {
      set({ sdkError: (e as Error).message ?? "Failed to load Spotify player" });
      return;
    }
    if (!Spotify) {
      set({ sdkError: "Spotify player unavailable" });
      return;
    }

    const player = new Spotify.Player({
      name: "Jokerly Web Player",
      getOAuthToken: async (cb) => {
        try {
          const session = await getSession();
          const freshToken = (session?.accessToken as string | undefined) ?? get().accessToken ?? accessToken;
          if (freshToken) set({ accessToken: freshToken });
          cb(freshToken ?? "");
        } catch {
          cb(get().accessToken ?? accessToken);
        }
      },
      volume: 0.8,
    });

    player.addListener("ready", (payload) => {
      const ready = payload as { device_id: string };
      addLog(`[SDK] Player ready, device: ${ready.device_id}`, "info");
      set({ deviceId: ready.device_id, isPlayerReady: true });
      // Do NOT call /me/player with play:false here — it pauses any currently
      // active Spotify session on the user's account. The device_id is already
      // embedded in every subsequent /me/player/play call, which activates this
      // device automatically when the user first plays a track.

      // Recover playback after route hard reloads: if app believed we were
      // playing and we still have a valid queue item, resume it on this device.
      const snapshot = get();
      const idx = snapshot.queueIndex;
      if (pendingPlayOnReadyIndex !== null) {
        const queuedIndex = pendingPlayOnReadyIndex;
        pendingPlayOnReadyIndex = null;
        Promise.resolve(get().playIndex(queuedIndex)).catch(() => {});
        return;
      }

      if (snapshot.isPlaying && idx >= 0 && idx < snapshot.queue.length && snapshot.queue[idx]?.uri) {
        Promise.resolve(get().playIndex(idx)).catch(() => {});
      }
    });

    player.addListener("not_ready", () => {
      addLog("[SDK] Player not ready (device went offline)", "warn");
      stopAutoResumeLoop();
      set({ deviceId: null, isPlayerReady: false });
    });

    player.addListener("player_state_changed", (state) => {
      const previous = get();
      hydrateFromSdkState((state as SpotifyPlayerState | null) ?? null);

      const nextState = (state as SpotifyPlayerState | null) ?? null;
      const currentUri = nextState?.track_window.current_track.uri;
      const likelyEnded =
        previous.isPlaying &&
        previous.durationMs > 0 &&
        previous.progressMs >= Math.max(0, previous.durationMs - 1500) &&
        previous.progressMs > 0 &&
        !!nextState &&
        nextState.paused &&
        nextState.position === 0 &&
        currentUri === previous.currentTrack?.uri;

      if (likelyEnded) {
        stopAutoResumeLoop();
        set({ endedToken: previous.endedToken + 1 });
        return;
      }

      if (nextState && !nextState.paused) {
        clearPlayRetry();
        stopAutoResumeLoop();
        return;
      }

      const unexpectedPausedInterruption =
        !!nextState &&
        previous.isPlaying &&
        nextState.paused &&
        nextState.position > 0 &&
        Date.now() >= ignorePausedUntil &&
        Date.now() >= suppressAutoResumeUntil;

      if (unexpectedPausedInterruption) {
        addLog(`[SDK] Unexpected pause at ${nextState.position}ms — starting auto-resume`, "warn");
        startAutoResumeLoop();
      }
    });

    player.addListener("initialization_error", () => {
      addLog("[SDK] initialization_error — player failed to init", "error");
      set({ isPlayerReady: false, sdkError: "Player failed to initialize. Reload the page." });
    });
    player.addListener("authentication_error", async () => {
      addLog("[SDK] authentication_error — refreshing token", "warn");
      try {
        const session = await getSession();
        if (session?.accessToken && !(session as { error?: string }).error) {
          set({ accessToken: session.accessToken as string, sdkError: null });
          await player.connect();
          return;
        }
      } catch { /* fall through to error */ }
      addLog("[SDK] authentication_error — token refresh failed", "error");
      set({ isPlayerReady: false, sdkError: "Spotify authentication error. Try signing out and back in." });
    });
    player.addListener("account_error", () => {
      addLog("[SDK] account_error — Spotify Premium required", "error");
      set({ isPlayerReady: false, sdkError: "Spotify Premium is required to use the player." });
    });

    const connected = await player.connect();
    if (connected) {
      set({ player });
      player.setVolume(get().volume).catch(() => {});
    }
  },

  setQueueAndPlay: async (tracks, index) => {
    requestAudioFocus(); // steal iOS audio focus synchronously within the user gesture
    set({ queue: tracks });
    get().playIndex(index);
  },

  updateTrackUri: (index, uri, imageUrl, durationMs) => {
    const { queue } = get();
    const updated = [...queue];
    updated[index] = {
      ...updated[index],
      uri,
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(durationMs ? { durationMs } : {}),
    };

    const currentTrack = get().currentTrack;
    const queueIndex = get().queueIndex;

    if (queueIndex === index && currentTrack) {
      set({ queue: updated, currentTrack: updated[index] });
      return;
    }

    set({ queue: updated });
  },

  playIndex: async (index) => {
    const { queue, deviceId, currentTrack, isPlaying, isTransitioning } = get();
    if (index < 0 || index >= queue.length) return;
    if (isTransitioning) return;

    const nextTrack = queue[index];
    const uriEntries = queue
      .map((track, queueIndex) => ({ uri: track.uri, queueIndex }))
      .filter((item): item is { uri: string; queueIndex: number } => Boolean(item.uri));

    const targetPosition = uriEntries.findIndex((item) => item.queueIndex === index);
    if (targetPosition === -1) {
      set({
        pendingIndex: null,
        isTransitioning: false,
        queueIndex: index,
        currentTrack: nextTrack,
        isPlaying: false,
      });
      return;
    }

    if (!deviceId) {
      // First click can happen before SDK reports ready device; queue it and auto-start on ready.
      addLog(`[playIndex] No device yet — queuing index ${index} for when SDK is ready`, "warn");
      pendingPlayOnReadyIndex = index;
      set({
        pendingIndex: index,
        isTransitioning: false,
        queueIndex: index,
        currentTrack: nextTrack,
        isPlaying: false,
        progressMs: 0,
        durationMs: nextTrack.durationMs ?? 0,
      });
      return;
    }

    pendingPlayOnReadyIndex = null;
    clearPlayRetry();
    ignorePausedUntil = Date.now() + 1400;
    const hasActivePlayback = !!currentTrack && isPlaying;
    set({
      pendingIndex: index,
      isTransitioning: true,
      ...(hasActivePlayback
        ? {}
        : {
            queueIndex: index,
            currentTrack: nextTrack,
            isPlaying: true,
            progressMs: 0,
            durationMs: nextTrack.durationMs ?? 0,
          }),
    });

    addLog(`[playIndex] Playing "${nextTrack.name}" (index ${index}, offset ${targetPosition})`, "info");
    try {
      await playerApi("play", {
        deviceId,
        uris: uriEntries.map((item) => item.uri),
        offset: { position: targetPosition },
        positionMs: 0,
      });
    } catch (e) {
      addLog(`[playIndex] API error: ${e instanceof Error ? e.message : String(e)} — retrying`, "error");
      schedulePlayRetry(index);
      set({
        pendingIndex: null,
        isTransitioning: false,
        ...(hasActivePlayback ? {} : { isPlaying: false }),
      });
      return;
    }

    set({
      queueIndex: index,
      currentTrack: nextTrack,
      pendingIndex: null,
      isPlaying: true,
      isTransitioning: false,
      progressMs: 0,
      durationMs: nextTrack.durationMs ?? 0,
    });
  },

  togglePlay: async () => {
    const { player, isPlaying } = get();
    if (!player) return;

    if (isPlaying) {
      // User-initiated pause should not trigger interruption auto-resume.
      suppressAutoResumeUntil = Date.now() + 3000;
      stopAutoResumeLoop();
    } else {
      suppressAutoResumeUntil = 0;
      requestAudioFocus(); // steal iOS audio focus when resuming
    }

    await player.togglePlay();
  },

  seek: async (ratio) => {
    const { player, durationMs } = get();
    if (!player || !isFinite(durationMs) || durationMs <= 0) return;
    const target = Math.max(0, Math.min(durationMs, Math.floor(durationMs * ratio)));
    await player.seek(target);
  },

  stop: async () => {
    const { player } = get();
    suppressAutoResumeUntil = Date.now() + 60_000;
    pendingPlayOnReadyIndex = null;
    clearPlayRetry();
    stopAutoResumeLoop();
    if (player) {
      await player.pause().catch(() => {});
    }
    set({
      currentTrack: null,
      isPlaying: false,
      isTransitioning: false,
      pendingIndex: null,
      queue: [],
      queueIndex: -1,
      progressMs: 0,
      durationMs: 0,
    });
  },

  setRepeatMode: async (mode) => {
    set({ repeatMode: mode });
    const { deviceId } = get();
    if (!deviceId) return;
    const state = mode === "one" ? "track" : mode === "all" ? "context" : "off";
    await playerApi("repeat", { deviceId, state }).catch(() => {});
  },

  toggleShuffle: async () => {
    const next = !get().shuffleEnabled;
    set({ shuffleEnabled: next });
    const { deviceId } = get();
    if (!deviceId) return;
    await playerApi("shuffle", { deviceId, state: next }).catch(() => {});
  },

  setCrossfadeEnabled: (enabled) => {
    set({ crossfadeEnabled: enabled });
  },

  setCrossfadeSeconds: (seconds) => {
    const clamped = Math.max(1, Math.min(12, Math.floor(seconds)));
    set({ crossfadeSeconds: clamped });
  },

  setVolume: async (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set({ volume: clamped });
    const { player } = get();
    if (player) await player.setVolume(clamped).catch(() => {});
  },

  removeFromQueue: (index) => {
    const { queue, queueIndex } = get();
    const updated = queue.filter((_, i) => i !== index);
    const newIndex =
      index < queueIndex ? queueIndex - 1
      : index === queueIndex ? Math.min(queueIndex, updated.length - 1)
      : queueIndex;
    set({ queue: updated, queueIndex: Math.max(0, newIndex) });
  },

  reorderQueue: (fromIndex, toIndex) => {
    const { queue, queueIndex } = get();
    const updated = [...queue];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    let newQueueIndex = queueIndex;
    if (fromIndex === queueIndex) newQueueIndex = toIndex;
    else if (fromIndex < queueIndex && toIndex >= queueIndex) newQueueIndex = queueIndex - 1;
    else if (fromIndex > queueIndex && toIndex <= queueIndex) newQueueIndex = queueIndex + 1;
    set({ queue: updated, queueIndex: newQueueIndex });
  },

  moveToNext: (index) => {
    const { queue, queueIndex } = get();
    if (index === queueIndex || index === queueIndex + 1) return;
    // Destination: slot right after current (accounting for removal shifting)
    const toIndex = index < queueIndex ? queueIndex : queueIndex + 1;
    const updated = [...queue];
    const [moved] = updated.splice(index, 1);
    updated.splice(toIndex, 0, moved);
    let newQueueIndex = queueIndex;
    if (index < queueIndex && toIndex >= queueIndex) newQueueIndex = queueIndex - 1;
    else if (index > queueIndex && toIndex <= queueIndex) newQueueIndex = queueIndex + 1;
    set({ queue: updated, queueIndex: newQueueIndex });
  },

  setSleepTimer: (minutes) => {
    if (minutes === null) {
      set({ sleepTimerEndsAt: null });
    } else {
      set({ sleepTimerEndsAt: Date.now() + minutes * 60_000 });
    }
  },

  getNextIndex: () => {
    const { queue, queueIndex, repeatMode, shuffleEnabled } = get();
    if (queue.length === 0 || queueIndex < 0) return null;
    if (repeatMode === "one") return queueIndex;

    const playableIndexes = queue
      .map((track, index) => ({ index, uri: track.uri }))
      .filter((item) => item.uri !== null);
    if (playableIndexes.length === 0) return null;

    if (shuffleEnabled && playableIndexes.length > 1) {
      const candidates = playableIndexes.map((item) => item.index).filter((index) => index !== queueIndex);
      if (candidates.length === 0) return queueIndex;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) return nextIndex;
    if (repeatMode === "all") return 0;
    return null;
  },

  getPrevIndex: () => {
    const { queue, queueIndex, repeatMode, shuffleEnabled } = get();
    if (queue.length === 0 || queueIndex < 0) return null;
    if (repeatMode === "one") return queueIndex;

    const playableIndexes = queue
      .map((track, index) => ({ index, uri: track.uri }))
      .filter((item) => item.uri !== null);
    if (playableIndexes.length === 0) return null;

    if (shuffleEnabled && playableIndexes.length > 1) {
      const candidates = playableIndexes.map((item) => item.index).filter((index) => index !== queueIndex);
      if (candidates.length === 0) return queueIndex;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0) return prevIndex;
    if (repeatMode === "all") return queue.length - 1;
    return null;
  },
}), {
  name: "jokerly-player-v1",
  storage: createJSONStorage(() => sessionStorage),
  partialize: (state) => ({
    currentTrack: state.currentTrack,
    queue: state.queue,
    queueIndex: state.queueIndex,
    pendingIndex: null,
    isPlaying: state.isPlaying,
    isTransitioning: false,
    progressMs: state.progressMs,
    durationMs: state.durationMs,
    repeatMode: state.repeatMode,
    shuffleEnabled: state.shuffleEnabled,
    crossfadeEnabled: state.crossfadeEnabled,
    crossfadeSeconds: state.crossfadeSeconds,
    volume: state.volume,
    isPlayerExpanded: false,
    isQueueOpen: false,
    sleepTimerEndsAt: null,
    endedToken: 0,
    isPlayerReady: false,
    sdkError: null,
    player: null,
    deviceId: null,
    accessToken: null,
    initializePlayer: state.initializePlayer,
    setQueueAndPlay: state.setQueueAndPlay,
    updateTrackUri: state.updateTrackUri,
    playIndex: state.playIndex,
    togglePlay: state.togglePlay,
    seek: state.seek,
    stop: state.stop,
    setRepeatMode: state.setRepeatMode,
    toggleShuffle: state.toggleShuffle,
    setCrossfadeEnabled: state.setCrossfadeEnabled,
    setCrossfadeSeconds: state.setCrossfadeSeconds,
    getNextIndex: state.getNextIndex,
    getPrevIndex: state.getPrevIndex,
    setVolume: state.setVolume,
    removeFromQueue: state.removeFromQueue,
    setSleepTimer: state.setSleepTimer,
  }),
}));
