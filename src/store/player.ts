import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getSession } from "next-auth/react";
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
  queueSheetTab: "queue" | "similar";
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

// Setup MediaSession handlers for external play/pause (lock screen, other apps)
function setupMediaSessionHandlers() {
  if (typeof navigator === "undefined" || !navigator.mediaSession) return;

  navigator.mediaSession.setActionHandler("play", () => {
    const snapshot = usePlayerStore.getState();
    if (!snapshot.isPlaying && snapshot.currentTrack) {
      Promise.resolve(snapshot.togglePlay()).catch(() => {});
    }
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    const snapshot = usePlayerStore.getState();
    if (snapshot.isPlaying) {
      Promise.resolve(snapshot.togglePlay()).catch(() => {});
    }
  });
}

// Update MediaSession playback state so OS knows we're playing/paused
function updateMediaSessionState(isPlaying: boolean) {
  if (typeof navigator === "undefined" || !navigator.mediaSession) return;
  navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
}
let ignorePausedUntil = 0;
let lastLoggedUri = "";
let suppressAutoResumeUntil = 0;
let autoResumeAttempts = 0;
const MAX_AUTO_RESUME_ATTEMPTS = 4;
const AUTO_RESUME_INTERVAL_MS = 1200;
let autoResumeTimer: ReturnType<typeof setInterval> | null = null;
let pendingPlayOnReadyIndex: number | null = null;
let playRetryTimer: ReturnType<typeof setTimeout> | null = null;
let playRetryIndex: number | null = null;
let playRetryCount = 0;
const MAX_PLAY_RETRIES = 4;

function clearPlayRetry(resetState = true) {
  if (!playRetryTimer) return;
  clearTimeout(playRetryTimer);
  playRetryTimer = null;
  if (resetState) {
    playRetryIndex = null;
    playRetryCount = 0;
  }
}

function schedulePlayRetry(index: number) {
  if (playRetryIndex !== index) {
    playRetryIndex = index;
    playRetryCount = 0;
  }

  if (playRetryCount >= MAX_PLAY_RETRIES) {
    clearPlayRetry(true);
    return;
  }

  playRetryCount += 1;
  const delayMs = Math.min(1700, 350 + playRetryCount * 250);
  clearPlayRetry(false);
  playRetryTimer = setTimeout(() => {
    const snapshot = usePlayerStore.getState();
    if (snapshot.isPlaying || snapshot.queueIndex !== index) {
      clearPlayRetry(true);
      return;
    }
    Promise.resolve(snapshot.playIndex(index)).catch(() => {});
  }, delayMs);
}

function parseErrorText(error: unknown) {
  const base = error instanceof Error ? error.message : String(error);
  // Some API responses are nested JSON serialized as strings; unwrap once when possible.
  try {
    const parsed = JSON.parse(base) as { error?: unknown };
    if (typeof parsed?.error === "string") return `${base} ${parsed.error}`;
  } catch {
    // keep base message
  }
  return base;
}

function isStaleDeviceError(errorText: string) {
  const normalized = errorText.toLowerCase();
  return normalized.includes("device not found") ||
    (normalized.includes('"status"') && normalized.includes("404") && normalized.includes("not found"));
}

function isAuthError(errorText: string) {
  const normalized = errorText.toLowerCase();
  return normalized.includes("unauthorized") ||
    normalized.includes("authentication") ||
    normalized.includes("access token") ||
    normalized.includes('"status":401') ||
    normalized.includes("spotify api 401");
}

function stopAutoResumeLoop() {
  if (!autoResumeTimer) return;
  clearInterval(autoResumeTimer);
  autoResumeTimer = null;
  autoResumeAttempts = 0;
}

async function tryAutoResumeFromInterruption() {
  const snapshot = usePlayerStore.getState();
  if (Date.now() < suppressAutoResumeUntil) return;
  if (!snapshot.player || !snapshot.currentTrack?.uri || snapshot.queueIndex < 0 || !snapshot.deviceId) {
    stopAutoResumeLoop();
    return;
  }
  if (snapshot.isPlaying) {
    stopAutoResumeLoop();
    return;
  }
  if (autoResumeAttempts >= MAX_AUTO_RESUME_ATTEMPTS) {
    suppressAutoResumeUntil = Date.now() + 30_000;
    stopAutoResumeLoop();
    return;
  }

  autoResumeAttempts += 1;
  try {
    await playerApi("play", {
      deviceId: snapshot.deviceId,
      uris: [snapshot.currentTrack.uri],
      positionMs: Math.max(0, snapshot.progressMs),
    });
    ignorePausedUntil = Date.now() + 1400;
    updateMediaSessionState(true);
  } catch (e) {
    const errorText = parseErrorText(e);
    if (isAuthError(errorText)) {
      suppressAutoResumeUntil = Date.now() + 60_000;
      stopAutoResumeLoop();
      usePlayerStore.setState({
        isPlaying: false,
        isTransitioning: false,
        isPlayerReady: false,
        sdkError: "Spotify session expired. Sign in again to continue playback.",
      });
    }
  }
}

function startAutoResumeLoop() {
  if (autoResumeTimer) return;
  autoResumeAttempts = 0;
  void tryAutoResumeFromInterruption();
  autoResumeTimer = setInterval(() => void tryAutoResumeFromInterruption(), AUTO_RESUME_INTERVAL_MS);
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

  updateMediaSessionState(!state.paused);

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
  queueSheetTab: "queue",
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
          const sessionError = (session as { error?: string } | null)?.error;
          if (sessionError) {
            stopAutoResumeLoop();
            clearPlayRetry(true);
            set({
              isPlaying: false,
              isPlayerReady: false,
              sdkError: "Spotify session expired. Sign in again to continue playback.",
            });
            cb("");
            return;
          }
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
      clearPlayRetry(true);
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
      clearPlayRetry(true);
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

      if (unexpectedPausedInterruption && get().deviceId) {
        startAutoResumeLoop();
      }
    });

    player.addListener("initialization_error", () => {
      set({ isPlayerReady: false, sdkError: "Player failed to initialize. Reload the page." });
    });
    player.addListener("authentication_error", async () => {
      suppressAutoResumeUntil = Date.now() + 60_000;
      stopAutoResumeLoop();
      clearPlayRetry(true);
      try {
        const session = await getSession();
        if (session?.accessToken && !(session as { error?: string }).error) {
          set({ accessToken: session.accessToken as string, sdkError: null });
          await player.connect();
          return;
        }
      } catch { /* fall through to error */ }
      set({
        isPlaying: false,
        isTransitioning: false,
        isPlayerReady: false,
        sdkError: "Spotify session expired. Sign in again to continue playback.",
      });
    });
    player.addListener("account_error", () => {
      set({ isPlayerReady: false, sdkError: "Spotify Premium is required to use the player." });
    });

    const connected = await player.connect();
    if (connected) {
      setupMediaSessionHandlers(); // respond to external play/pause commands
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
    clearPlayRetry(index !== playRetryIndex);
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

    try {
      await playerApi("play", {
        deviceId,
        uris: uriEntries.map((item) => item.uri),
        offset: { position: targetPosition },
        positionMs: 0,
      });
    } catch (e) {
      const errorText = parseErrorText(e);
      if (isStaleDeviceError(errorText)) {
        pendingPlayOnReadyIndex = index;
        clearPlayRetry(true);
        set({
          deviceId: null,
          pendingIndex: index,
          isTransitioning: false,
          ...(hasActivePlayback ? {} : { isPlaying: false }),
        });
        const player = get().player;
        if (player) {
          Promise.resolve(player.connect()).catch(() => {});
        }
        return;
      }

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
    updateMediaSessionState(true);
  },

  togglePlay: async () => {
    const { player, isPlaying } = get();
    if (!player) return;

    if (isPlaying) {
      // User-initiated pause should not trigger interruption auto-resume.
      suppressAutoResumeUntil = Date.now() + 3000;
      stopAutoResumeLoop();
      updateMediaSessionState(false); // proactive update
    } else {
      suppressAutoResumeUntil = 0;
      requestAudioFocus(); // steal iOS audio focus when resuming
      updateMediaSessionState(true); // proactive update
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
    updateMediaSessionState(false);
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
    queueSheetTab: "queue",
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
